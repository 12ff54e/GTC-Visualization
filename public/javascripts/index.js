'use strict';
import {
    historyMode,
    snapshotPoloidal,
    snapshotPoloidalPreview,
    snapshotSpectrum,
    trackingPlot,
    addSimulationRegion,
} from './plot-data-process.js';
import { generateSummary } from './summary-generate.js';
import './state.js';
import {
    callEventTarget,
    propagateFetchError,
    nodeIs,
    postForm,
} from './util.js';
import { requestPlotData, downloadOutputFiles } from './api.js';
import {
    getBasicParameters,
    refreshTimeUnitFactor,
    applyTimeUnitToFigures,
    TIME_UNIT_LABEL,
} from './units.js';
import {
    ensurePlotRangeControls,
    renderPlotRangeControls,
    refreshPlotRangeControls,
} from './figure-range-controls.js';
import {
    StatusBar,
    getStatusBar,
    wrap,
    addLoadingIndicator,
} from './status-bar.js';

// StatusBar, getStatusBar, wrap, and addLoadingIndicator are now
// imported from status-bar.js

// Global application state is now managed by state.js (imported above).
// It is still accessible as `window.GTCGlobal` for backward compatibility
// with modules that have not yet been migrated to direct ES imports.

window.addEventListener('load', () => {
    new StatusBar(document.getElementById('status'));

    const unitToggleButton = document.getElementById('units-toggle-button');
    const unitChooser = document.getElementById('unit-chooser');
    unitToggleButton.addEventListener('click', e => {
        e.preventDefault();
        unitChooser.classList.toggle('active');
    });

    const timeUnitSelect = document.getElementById('time-unit-select');
    timeUnitSelect.addEventListener(
        'change',
        wrap(async e => {
            window.GTCGlobal.units.time = e.target.value;
            await refreshTimeUnitFactor();

            if (window.GTCGlobal.current_plot_btn) {
                await addLoadingIndicator(
                    getDataThenPlot.bind(window.GTCGlobal.current_plot_btn)
                )();
            }
        })
    );

    // register plot type tabs
    for (let swc of document.getElementsByClassName('tab-l0-switch')) {
        swc.visited = false;
        const div = document.getElementById('files');
        if (swc.id === 'Snapshot') {
            swc.addEventListener('change', e => {
                // expand snapshot file list
                div.classList.add('active');
                cleanPlot();
                cleanPanel();
            });
        } else {
            swc.addEventListener(
                'change',
                wrap(async e => {
                    // collapse snapshot file list
                    div.classList.remove('active');
                    for (const btn of div.children) {
                        btn.classList.remove('snapshot-selected');
                    }
                    await addLoadingIndicator(callEventTarget(openPanel))(e);
                })
            );
        }
        swc.disabled = false;
    }

    // snapshot file name buttons
    for (let btn of document.getElementById('files').children) {
        btn.addEventListener(
            'click',
            wrap(async e => {
                for (let b of e.target.parentElement.children) {
                    b.classList.remove('snapshot-selected');
                }
                e.target.classList.add('snapshot-selected');
                // set current snapshot file
                window.GTCGlobal.current_snapshot = e.target;
                await addLoadingIndicator(callEventTarget(openPanel))(e);
            })
        );
    }

    addDownloadFunction();

    // initial breadcrumb
    const navi_segments = [
        ...document.querySelector('#breadcrumb-container').children,
    ];
    const clearDropdown = exception => {
        navi_segments.forEach(s => {
            if (s === exception) {
                return;
            }
            s.classList.remove('active');
            for (const child of s.children) {
                child.classList.remove('active');
            }
        });
    };
    wrap(async () => {
        const res = await fetch('/fileTree');
        await propagateFetchError(res);
        const { file_tree } = await res.json();

        const constructPath = entry => {
            return entry
                ? `${constructPath(entry.parent)}/${entry.dirname}`
                : '';
        };

        // add drop down list
        const constructFolderContentList = (parent, child) => {
            const ul = document.createElement('ul');

            if (parent === undefined) {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = '/';
                a.innerText = '(Go Back to File Tree View)';
                li.classList.add('breadcrumb-dropdown-item');
                li.appendChild(a);
                ul.appendChild(li);
                return ul;
            }

            for (const entry of parent.content) {
                if (typeof entry === 'string') {
                    continue;
                }
                entry.parent = parent;
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.innerText = entry.dirname;
                li.appendChild(a);

                li.classList.add('breadcrumb-dropdown-item');
                if (child?.dirname === entry.dirname) {
                    li.classList.add('current-item');
                }

                if (entry.mTimeMs) {
                    // a gtc output folder
                    a.addEventListener('click', () => {
                        postForm('/plot', { gtc_output: constructPath(entry) });
                    });
                    const span = document.createElement('span');
                    span.innerText = 'gtc.out';
                    span.classList.add('output');
                    li.appendChild(span);
                }

                if (entry.count.folders > 1) {
                    // a folder contains subfolders
                    li.classList.add('folder');
                    li.appendChild(constructFolderContentList(entry));
                    li.addEventListener('click', event => {
                        event.stopPropagation();
                        event.currentTarget.classList.toggle('folder-expand');
                    });
                }
                ul.appendChild(li);
            }

            return ul;
        };

        let currentEntry = undefined;
        navi_segments.forEach((seg, idx) => {
            // first span is the copy button
            if (idx == 0) {
                return;
            }
            const parentEntry = currentEntry;
            currentEntry = currentEntry
                ? currentEntry.content.find(
                      f => f.dirname === seg.firstElementChild.innerText
                  )
                : file_tree;

            seg.lastElementChild.append(
                constructFolderContentList(parentEntry, currentEntry)
            );
            seg.addEventListener('click', event => {
                clearDropdown(event.currentTarget);
                for (const child of event.currentTarget.children) {
                    child.classList.toggle('active');
                }
            });
        });
        // clear dropdown when clicked on other parts on the page
        document.addEventListener('click', event => {
            if (
                !nodeIs(event.target, elem =>
                    elem.classList.contains('breadcrumb-item')
                )
            ) {
                clearDropdown();
            }
        });
    })();

    // button for copy path
    document.getElementById('copy-path').addEventListener(
        'click',
        wrap(async ev => {
            const path = document.getElementById('entry-path').innerText;
            if (!navigator.clipboard) {
                clearDropdown();
                const div = ev.target.nextElementSibling;
                div.classList.toggle('active');
                if (window.getSelection) {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(div.firstElementChild);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
                return;
            }
            await navigator.clipboard.writeText(path);
            const btn = ev.target;
            const icon = btn.innerText;
            btn.innerText = 'check';
            btn.disabled = true;
            setTimeout(() => {
                btn.innerText = icon;
                btn.disabled = false;
            }, 500);
        })
    );
});

window.addEventListener('error', () => {
    getStatusBar().err = StatusBar.DEFAULT_ERROR;
});

function addDownloadFunction() {
    // add GTC output file download cb
    const downloadForm = document.querySelector('#download-output');
    // button for expand/collapse file list
    downloadForm.querySelector('button').addEventListener('click', e => {
        e.preventDefault();
        e.target.nextSibling.classList.toggle('select-show');
    });
    // submit file list for download
    downloadForm.querySelectorAll('input').forEach(btn =>
        btn.addEventListener(
            'click',
            wrap(async e => {
                e.preventDefault();
                const loading = downloadForm.querySelector('#download-overlay');
                loading.style.visibility = 'initial';

                const { blob, filename } = await downloadOutputFiles(
                    document.querySelector('#output-tag').innerText,
                    e.target.id.endsWith('all'),
                    new FormData(downloadForm)
                );

                // create link for downloading file
                const a = document.body.appendChild(
                    document.createElement('a')
                );
                a.href = window.URL.createObjectURL(blob);
                if (filename) {
                    a.download = filename;
                }
                a.click();
                a.remove();
                loading.style.visibility = 'hidden';
            })
        )
    );
}

function registerButtons(buttons, cb = getDataThenPlot) {
    buttons.forEach(btn => {
        btn.addEventListener(
            'click',
            wrap(addLoadingIndicator(callEventTarget(cb)))
        );
    });
}

// Figure range controls (ensurePlotRangeControls, renderPlotRangeControls,
// refreshPlotRangeControls) are now imported from figure-range-controls.js

async function openPanel(clean_beforehand = true) {
    if (this.id == 'Summary') {
        await buildSummaryPage();
        return;
    }

    // link radio id to panel id
    let majorType = this.id.startsWith('snap') ? 'Snapshot' : this.id;
    let panelName = `${majorType}-panel`;

    // modifies status bar
    const statusBar = getStatusBar();

    cleanPanel();
    if (clean_beforehand) {
        cleanPlot();
    }
    let panel = document.getElementById(panelName);
    panel.style.opacity = 1;
    panel.style.zIndex = 2;
    window.GTCGlobal.activePanel = panel;
    ensurePlotRangeControls(panel);

    // inform the server about which .out file should be parsed
    let {
        info,
        warn,
        err,
        id: btn_id_array,
    } = await (await requestPlotData(`plotType/${this.id}`)).json();

    statusBar.info = info ? info : '';
    statusBar.warn = warn ? warn : '';
    if (err) {
        statusBar.err = err;
        return;
    }

    // wait for the response, then create buttons for plotting
    await getBasicParameters();

    // add buttons
    const node =
        this.localName === 'input'
            ? this.parentNode
            : this.parentNode.parentNode;
    if (node.visited) {
        return;
    } else {
        node.visited = true;
    }

    // Equilibrium panel needs special care
    if (this.id === 'Equilibrium') {
        let { x, y, poloidalPlane, others } = btn_id_array;
        btn_id_array = [poloidalPlane, others];
        createEqPanel1D(x, y);
    }

    // group is array of strings used as button id
    const create_l1_group = (group, cb) => {
        let subDiv = document.createElement('div');
        const btns = group.map(btnID => {
            let btn = document.createElement('button');
            btn.setAttribute('id', `${majorType}-${btnID}`);
            btn.setAttribute('class', 'tab-l1-btn');
            btn.innerText = btnID;
            subDiv.appendChild(btn);

            return btn;
        });
        registerButtons(btns, cb);
        return subDiv;
    };
    btn_id_array.forEach(group => {
        panel.appendChild(create_l1_group(group));
    });

    if (this.id === 'History') {
        addHistoryRecal(panel);
    }

    if (this.id.startsWith('snap')) {
        addSnapshotPlayer(panel, create_l1_group);

        panel.querySelectorAll('button').forEach(btn => {
            if (btn.id.endsWith('-poloidal')) {
                btn.classList.add('can-preview');
                btn.addEventListener(
                    'mouseenter',
                    wrap(async () => {
                        document.querySelector(
                            '#poloidal-preview'
                        ).style.display = 'initial';
                        const res = await requestPlotData(`data/${btn.id}`);
                        await snapshotPoloidalPreview(await res.json());
                    })
                );
                btn.addEventListener('mouseleave', ev => {
                    document.querySelector('#poloidal-preview').style.display =
                        'none';
                });
            }
        });
    }
}

async function buildSummaryPage() {
    await getBasicParameters();
    const summary_data = await (await requestPlotData('Summary')).json();
    const summaryContainer = await generateSummary(summary_data);

    if (summaryContainer === undefined) {
        // summary page is already generated
        return;
    }

    // register jump button on summary page
    summaryContainer.querySelectorAll('.summary-jump-button').forEach(btn => {
        btn.addEventListener(
            'click',
            wrap(async e => {
                e.preventDefault();
                const panelSwitch = document.querySelector(
                    `#${btn.id.split('-')[1]}`
                );
                await addLoadingIndicator(openPanel.bind(panelSwitch))();

                panelSwitch.checked = true;
                document.querySelector(`#${btn.id.slice(8)}`).click();
            })
        );
    });
}

function addHistoryRecal(panel) {
    const div = document.createElement('div');
    const btn = document.createElement('button');
    btn.innerText =
        'Recalculate\ngrowth rate and frequency\naccording to zoomed range';
    btn.classList.add('tab-l1-btn');
    btn.addEventListener(
        'click',
        wrap(async function () {
            const figures = [1, 2, 3, 4].map(i =>
                document.getElementById(`figure-${i}`)
            );
            const len = figures[0].data[0].x[figures[0].data[0].x.length - 1];
            await historyMode(
                figures,
                window.GTCGlobal.hist_mode_range.growthRate &&
                    window.GTCGlobal.hist_mode_range.growthRate.map(
                        i => i / len
                    ),
                window.GTCGlobal.hist_mode_range.frequency &&
                    window.GTCGlobal.hist_mode_range.frequency.map(i => i / len)
            );

            figures.forEach(figure => {
                Plotly.react(figure, figure.data, figure.layout);
            });
            refreshPlotRangeControls();
        })
    );

    div.classList.add('dropdown');
    div.style['overflow'] = 'hidden';
    div.append(btn);
    panel.prepend(div);
}

async function addSnapshotPlayer(panel, create_l1_group) {
    panel.appendChild(
        create_l1_group(
            [
                'previous snapshot',
                'next snapshot',
                'previous (continuously)',
                'next (continuously)',
            ],
            async function () {
                let cont = this.innerText.endsWith('(continuously)');
                const prev = this.innerText.startsWith('prev');
                const stopper = ev => {
                    if (ev.key === 's') {
                        cont = false;
                    }
                };
                window.GTCGlobal.snapshot_playing = true;
                window.addEventListener('keypress', stopper);

                const delay = 300; // shortest possible frame inteval
                // real frame interval might be larger due to network and/or render
                let last_time = document.timeline.currentTime - delay;

                const animate = async timestamp => {
                    if (timestamp - last_time < delay) {
                        requestAnimationFrame(animate);
                        return;
                    }
                    const current_snapshot = GTCGlobal.current_snapshot;
                    if (prev) {
                        if (current_snapshot.previousElementSibling) {
                            GTCGlobal.current_snapshot =
                                current_snapshot.previousElementSibling;
                        } else {
                            if (!cont) {
                                alert('No previous snapshot');
                            }
                            cont = false;
                        }
                    } else {
                        if (current_snapshot.nextElementSibling) {
                            GTCGlobal.current_snapshot =
                                current_snapshot.nextElementSibling;
                        } else {
                            if (!cont) {
                                alert('No next snapshot');
                            }
                            cont = false;
                        }
                    }
                    await openPanel.call(GTCGlobal.current_snapshot, false);
                    if (GTCGlobal.current_snapshot_figure) {
                        await getDataThenPlot.call(
                            GTCGlobal.current_snapshot_figure,
                            false
                        );
                    }
                    current_snapshot.classList.remove('snapshot-selected');
                    GTCGlobal.current_snapshot.classList.add(
                        'snapshot-selected'
                    );

                    last_time = timestamp;
                    if (cont) {
                        requestAnimationFrame(animate);
                    } else {
                        // cleanup
                        window.removeEventListener('keypress', stopper);
                        window.GTCGlobal.snapshot_playing = false;
                    }
                };
                requestAnimationFrame(animate);
            }
        )
    );
}

function cleanPlot() {
    for (let div of document.getElementById('figure-wrapper').children) {
        div.classList.remove('active');
        if (div.firstElementChild?.tagName === 'CANVAS') {
            div.className = ''; // ensures subsequent Plotly.react works properly
            div.removeChild(div.firstElementChild);
        }
    }

    GTCGlobal.current_snapshot_figure = undefined;
    renderPlotRangeControls();
}

function cleanPanel() {
    const panel = document.getElementById('panel');
    for (let p of panel.children) {
        p.style.opacity = 0;
        p.style.zIndex = 1;
    }

    const recalculate = panel.querySelector('#History-panel').firstElementChild;
    if (recalculate) {
        recalculate.classList.remove('active');
    }

    const summary = document.querySelector('#container');
    summary.style.display = 'none';
}

async function getDataThenPlot(clean_beforehand = true) {
    if (clean_beforehand) {
        cleanPlot();
    }

    await refreshTimeUnitFactor();

    const res = await requestPlotData(`data/${this.id}`, {
        query: window.GTCGlobal.snapshot_playing ? '&snapshot_playing' : '',
    });
    let figures = await res.json();
    window.GTCGlobal.current_plot_btn = this;

    // apply currently selected time unit to figures before plotting / postprocessing
    applyTimeUnitToFigures(this.id, figures);

    // some figures need some local calculation
    const recalculate =
        document.getElementById('History-panel').firstElementChild;
    if (this.id.startsWith('History')) {
        recalculate.classList.remove('active');
    }
    if (this.id.startsWith('History') && this.id.includes('-mode')) {
        await historyMode(figures);
        window.GTCGlobal.hist_mode_range.frequency = undefined;
        window.GTCGlobal.hist_mode_range.growthRate = undefined;
        recalculate.classList.add('active');
    } else if (this.id.startsWith('Snapshot')) {
        await snapshotPreprocess(this, figures);
    } else if (this.id.startsWith('Tracking')) {
        await trackingPlot(figures);
        [1, 2].forEach(i => {
            document.getElementById(`figure-${i}`).classList.add('active');
        });
        refreshPlotRangeControls();
        return;
    } else if (this.id.startsWith('Equilibrium-1D-rg_n')) {
        figures.forEach(fig => {
            addSimulationRegion(fig);
        });
    }

    await Promise.all(
        figures.map(({ data, layout, force_redraw }, idx) => {
            const fig_div = document.querySelector(`#figure-${idx + 1}`);
            fig_div.classList.add('active');
            // restore height
            if (layout.height === undefined) {
                layout.height = 450;
            }
            return data
                ? (force_redraw ? Plotly.newPlot : Plotly.react)(
                      fig_div,
                      data,
                      layout,
                      {
                          editable: true,
                      }
                  )
                : Promise.resolve();
        })
    );

    refreshPlotRangeControls();
}

async function snapshotPreprocess(btn, figures) {
    if (btn.id.endsWith('spectrum')) {
        await snapshotSpectrum(figures);
    } else if (btn.id.endsWith('poloidal')) {
        const quick = btn.id.endsWith('quick_poloidal');
        const playing = window.GTCGlobal.snapshot_playing;
        // quick: do not fft; playing: data scheme is different
        let safety_factor = null;
        if (playing) {
            const fig_1 = document.getElementById('figure-1');
            const fig_2 = document.getElementById('figure-2');
            const [z] = figures.splice(
                0,
                1,
                {
                    data: fig_1.data,
                    layout: fig_1.layout,
                },
                {
                    data: fig_2.data,
                    layout: fig_2.layout,
                }
            );
            figures[0].data[1].z = z;
        } else {
            const res = await requestPlotData('plotType/Equilibrium', {
                optional: true,
            });
            safety_factor = res.ok
                ? (
                      await (
                          await requestPlotData('data/Equilibrium-1D-rg_n-q', {
                              optional: true,
                          })
                      )?.json()
                  )

                      ?.at(0)
                      ?.data?.at(0)
                : null;
        }
        await snapshotPoloidal(figures, safety_factor, quick, playing);
    }
    GTCGlobal.current_snapshot_figure = btn;
}

function createEqPanel1D(xDataTypes, yDataTypes) {
    const xDiv = document.getElementById('eq-x');
    const yDiv = document.getElementById('eq-y');

    // add x group radio buttons
    xDataTypes.forEach(xData => {
        let input = document.createElement('input');
        Object.assign(input, {
            id: `x-${xData}`,
            value: xData,
            type: 'radio',
            name: 'x',
            className: 'eq-1d-x',
        });

        let label = document.createElement('label');
        label.setAttribute('for', `x-${xData}`);
        label.innerText = xData;

        xDiv.appendChild(input);
        xDiv.appendChild(label);
    });

    // add y group radio buttons
    yDataTypes.forEach(yData => {
        let input = document.createElement('input');
        Object.assign(input, {
            id: `y-${yData}`,
            value: yData,
            type: 'radio',
            name: 'y',
            className: 'eq-1d-y',
        });

        let label = document.createElement('label');
        label.setAttribute('for', `y-${yData}`);
        label.innerText = yData;

        yDiv.appendChild(input);
        yDiv.appendChild(label);
    });

    // register form submit behaviour
    const form = document.getElementById('Equilibrium-panel').firstElementChild;
    form.addEventListener(
        'submit',
        wrap(async e => {
            e.preventDefault();

            const data = new FormData(form);
            const type = 'Equilibrium';

            const xType = data.get('x');
            const yType = data.get('y');

            if (!xType || !yType) {
                alert('Choose X and Y');
                return;
            }

            await addLoadingIndicator(
                getDataThenPlot.bind({
                    id: `${type}-1D-${xType}-${yType}`,
                })
            )();
        })
    );
}

// propagateFetchError, nodeIs, and postForm are now imported from util.js
