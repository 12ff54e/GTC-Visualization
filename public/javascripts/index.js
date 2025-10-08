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

// status bar on top
class StatusBar {
    constructor(root) {
        this.parent = root;
        root.status = this;
    }
    toString() {
        return (
            (this.information
                ? `<font color="green">${this.information}</font><br>`
                : '') +
            (this.warning
                ? `<font color="darkYellow">${this.warning}</font><br>`
                : '') +
            (this.error ? `<font color="red">${this.error}</font><br>` : '')
        );
    }
    show() {
        this.parent.innerHTML = this;
    }
    /**
     * @param {string} i
     */
    set info(i) {
        this.information = i;
        this.show();
    }
    /**
     * @param {string} w
     */
    set warn(w) {
        this.warning = w;
        this.show();
    }
    /**
     * @param {string} e
     */
    set err(e) {
        this.error = e;
        this.show();
    }
}
Object.defineProperty(StatusBar, 'DEFAULT_ERROR', {
    value: 'Oops, something wrong happened. Please check javascript console for more info.',
    writable: false,
    enumerable: true,
    configurable: false,
});

function getStatusBar() {
    return document.querySelector('#status').status;
}

// This script is deferred
const default_figure_wrapper = document.querySelector('#figure-wrapper');

class GTC_Instance {
    constructor(path, container = default_figure_wrapper) {
        this.hist_range = {
            growth_rate: undefined,
            frequency: undefined,
        };
        this.basicParameters = undefined;
        this.time_step = -1;
        this.current_panel = '';
        this.current_snapshot = '';
        this.current_figure_id = '';
        this.path = path;
        this.container = container;
    }

    reset_hist_range() {
        this.hist_range.growth_rate = undefined;
        this.hist_range.frequency = undefined;
    }
}

const GTCGlobals = (window.GTCGlobals = [
    new GTC_Instance(document.querySelector('#outputTag').innerText),
]);

window.addEventListener('load', () => {
    new StatusBar(document.getElementById('status'));

    // register plot type tabs
    for (let swc of document.getElementsByClassName('tab-l0-switch')) {
        swc.visited = false;
        if (swc.id === 'Snapshot') {
            swc.addEventListener('change', e => {
                // expand snapshot file list
                let div = document.getElementById('files');
                div.style.height = `${div.childElementCount * 1.3 + 0.2}rem`;
                cleanPanel();
                GTCGlobals.forEach(gtc_instance => {
                    cleanPlot(gtc_instance);
                });
            });
        } else {
            swc.addEventListener(
                'change',
                wrap(async e => {
                    // collapse snapshot file list
                    const div = document.getElementById('files');
                    div.style.height = '';
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
                GTCGlobals[0].current_snapshot = e.target;
                await addLoadingIndicator(callEventTarget(openPanel))(e);
            })
        );
    }

    addDownloadFunction();

    // initial breadcrumb
    wrap(addLoadingIndicator(initialBreadcrumb))();
});

window.addEventListener('error', () => {
    getStatusBar().err = StatusBar.DEFAULT_ERROR;
});

// wrap async function for error handling
function wrap(func) {
    return (...args) =>
        func(...args).catch(err => {
            console.log(err);
            getStatusBar().err = StatusBar.DEFAULT_ERROR;
        });
}

function callEventTarget(func, transform = e => e.target) {
    return e => func.call(transform(e));
}

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
                const url = `/plot/data/download?dir=${
                    document.querySelector('#outputTag').innerText
                }${e.target.id.endsWith('all') ? '&all' : ''}`;

                const data = new URLSearchParams();
                for (const [key, val] of new FormData(downloadForm).entries()) {
                    data.append(key, val);
                }

                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/x-www-form-urlencoded',
                    },
                    body: data,
                });
                if (!res.ok) {
                    console.error('File download failed');
                    throw `Server return ${res.status}:${res.statusText} upon requesting GTC output files`;
                }
                const blob = await res.blob();

                // create link for downloading file
                const a = document.body.appendChild(
                    document.createElement('a')
                );
                a.href = window.URL.createObjectURL(blob);

                // forward filename, if exist
                let match;
                if (
                    (match = res.headers
                        .get('Content-Disposition')
                        .match(/filename="(.*)"/))
                ) {
                    a.download = match[1];
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
        btn.addEventListener('click', ev => {
            GTCGlobals.forEach(gtc_instance => {
                wrap(addLoadingIndicator(cb.bind(ev.target)))(gtc_instance);
            });
        });
    });
}

async function fetchBasicParameters() {
    return Promise.all(
        GTCGlobals.map(async gtc_instance => {
            if (!gtc_instance.basicParameters) {
                const res = await fetch(
                    `plot/data/basicParameters?dir=${
                        document.querySelector('#outputTag').innerText
                    }`
                );
                await propagateFetchError(res);
                gtc_instance.basicParameters = await res.json();
                gtc_instance.time_step =
                    gtc_instance.basicParameters.ndiag *
                    gtc_instance.basicParameters.tstep;
            }
        })
    );
}

async function openPanel(clean_beforehand = true) {
    // TODO: Check all gtc instances and combine their figure buttons
    const gtc_instance = GTCGlobals[0];
    gtc_instance.current_panel = this.id;
    if (this.id == 'Summary') {
        await buildSummaryPage(gtc_instance);
        return;
    }

    // link radio id to panel id
    let majorType = this.id.startsWith('snap') ? 'Snapshot' : this.id;
    let panelName = `${majorType}-panel`;

    // modifies status bar
    const statusBar = document.getElementById('status').status;

    cleanPanel();
    if (clean_beforehand) {
        GTCGlobals.forEach(gtc_instance => {
            cleanPlot(gtc_instance);
        });
    }
    let panel = document.getElementById(panelName);
    panel.style.opacity = 1;
    panel.style.zIndex = 2;

    // inform the server about which .out file should be parsed
    let {
        info,
        warn,
        err,
        id: btn_id_array, // [[...],...]
    } = await (
        await requestPlotData(gtc_instance.path, `plotType/${this.id}`)
    ).json();

    statusBar.info = info ? info : '';
    statusBar.warn = warn ? warn : '';
    if (err) {
        statusBar.err = err;
        return;
    }

    // wait for the response, then create buttons for plotting
    await fetchBasicParameters();

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
        addHistoryRecalculation(gtc_instance, panel);
    }

    if (this.id.startsWith('snap')) {
        addSnapshotPlayer(gtc_instance, panel, create_l1_group);

        panel.querySelectorAll('button').forEach(btn => {
            if (btn.id.endsWith('-poloidal')) {
                btn.classList.add('can-preview');
                btn.addEventListener(
                    'mouseenter',
                    wrap(async () => {
                        document.querySelector(
                            '#poloidal-preview'
                        ).style.display = 'initial';
                        const res = await fetch(
                            `plot/data/${btn.id}?dir=${
                                document.querySelector('#outputTag').innerText
                            }`
                        );
                        await propagateFetchError(res);
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

async function buildSummaryPage(gtc_instance) {
    await fetchBasicParameters();
    const summaryContainer = await generateSummary(
        gtc_instance,
        getStatusBar()
    );

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

function addHistoryRecalculation(gtc_instance, panel) {
    const div = document.createElement('div');
    const btn = document.createElement('button');
    btn.innerText =
        'Recalculate\ngrowth rate and frequency\naccording to zoomed range';
    btn.classList.add('tab-l1-btn');
    btn.addEventListener(
        'click',
        wrap(async function () {
            const figures = [1, 2, 3, 4].map(i =>
                document.getElementById(
                    `${default_figure_wrapper.id}-figure-${i}`
                )
            );
            await historyMode(gtc_instance, figures);

            figures.forEach(figure => {
                Plotly.react(figure, figure.data, figure.layout);
            });
        })
    );

    div.classList.add('dropdown');
    div.append(btn);
    panel.prepend(div);
}

async function addSnapshotPlayer(gtc_instance, panel, create_l1_group) {
    panel.appendChild(
        create_l1_group(
            [
                'previous snapshot',
                'next snapshot',
                'previous (continuously)',
                'next (continuously)',
            ],
            async function () {
                let limit = this.innerText.endsWith('(continuously)')
                    ? Infinity
                    : 1;
                const stopper = ev => {
                    if (ev.key === 's') {
                        limit = 0;
                    }
                };
                window.addEventListener('keypress', stopper);
                for (let i = 0; i < limit; ++i) {
                    let current_snapshot = gtc_instance.current_snapshot;
                    if (i > 0) {
                        await new Promise(resolve => {
                            setTimeout(resolve, 200);
                        });
                    }
                    if (this.innerText.startsWith('prev')) {
                        if (current_snapshot.previousElementSibling) {
                            gtc_instance.current_snapshot =
                                current_snapshot.previousElementSibling;
                        } else {
                            if (i == 0) {
                                alert('No previous snapshot');
                            }
                            return;
                        }
                    } else {
                        if (current_snapshot.nextElementSibling) {
                            gtc_instance.current_snapshot =
                                current_snapshot.nextElementSibling;
                        } else {
                            if (i == 0) {
                                alert('No next snapshot');
                            }
                            return;
                        }
                    }
                    current_snapshot.classList.remove('snapshot-selected');
                    gtc_instance.current_snapshot.classList.add(
                        'snapshot-selected'
                    );
                    await openPanel.call(gtc_instance.current_snapshot, false);
                    if (gtc_instance.current_figure_id) {
                        await getDataThenPlot.call(
                            { id: gtc_instance.current_figure_id },
                            { ...gtc_instance, clean_beforehand: false }
                        );
                    }
                }
                window.removeEventListener('keypress', stopper);
            }
        )
    );
}

async function requestPlotData(path, name, optional = false) {
    // inform the server about which .out file should be parsed
    let res = await fetch(`plot/${name}?dir=${path}`);
    try {
        await propagateFetchError(res);
    } catch (e) {
        if (!optional) {
            throw e;
        }
    }
    return res;
}

function cleanPlot(gtc_instance = GTCGlobals[0]) {
    for (let div of gtc_instance.container.children) {
        div.classList.remove('active');
    }

    gtc_instance.current_figure_id = '';
}

function cleanPanel() {
    const panel = document.getElementById('panel');
    for (let p of panel.children) {
        p.style.opacity = 0;
        p.style.zIndex = 1;
    }

    const recalculate = panel.querySelector('#History-panel').firstElementChild;
    if (recalculate) {
        recalculate.style.height = '0rem';
    }

    const summary = document.querySelector('#container');
    summary.style.display = 'none';
}

function addLoadingIndicator(func) {
    return async (...args) => {
        const loading = document.querySelector('#loading');
        loading.style.visibility = 'visible';

        await func(...args);

        loading.style.visibility = 'hidden';
    };
}

/**
 *
 * @param {GTC_Instance & {clean_beforehand: bool}} opts
 * @returns
 */
async function getDataThenPlot(opts) {
    const clean_beforehand = opts?.clean_beforehand ?? true;
    const gtc_instance = opts ?? GTCGlobals[0];

    if (clean_beforehand) {
        cleanPlot(gtc_instance);
    }

    const res = await fetch(`plot/data/${this.id}?dir=${gtc_instance.path}`);
    await propagateFetchError(res);
    let figures = await res.json();

    // some figures need some local calculation
    const recalculate =
        document.getElementById('History-panel').firstElementChild;
    if (this.id.startsWith('History')) {
        recalculate.style.height = '0rem';
    }
    if (this.id.startsWith('History') && this.id.includes('-mode')) {
        // TODO: This behaviour might not be desired. A better solution might be remembering
        // range of each mode of each gtc instance
        gtc_instance.reset_hist_range();
        await historyMode(gtc_instance, figures);
        recalculate.style.height = '3.5rem';
    } else if (this.id.startsWith('Snapshot')) {
        await snapshotPreprocess(this, figures, gtc_instance);
    } else if (this.id.startsWith('Tracking')) {
        await trackingPlot(figures);
        return;
    } else if (this.id.startsWith('Equilibrium-1D-rg_n')) {
        figures.forEach(fig => {
            addSimulationRegion(gtc_instance, fig);
        });
    }

    await Promise.all(
        figures.map(({ data, layout, force_redraw }, idx) => {
            const fig_div = gtc_instance.container.querySelector(
                `#${gtc_instance.container.id}-figure-${idx + 1}`
            );
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

    if (this.id.startsWith('History') && this.id.includes('-mode')) {
        if (!gtc_instance.hist_range.ev_listener_added) {
            updateHistoryModeRange(gtc_instance);
        }
        gtc_instance.hist_range.ev_listener_added = true;
    }

    gtc_instance.current_figure_id = this.id;
}

/**
 *
 * @param {*} btn
 * @param {*} figures
 * @param {GTC_Instance} gtc_instance
 */
async function snapshotPreprocess(btn, figures, gtc_instance) {
    if (btn.id.endsWith('-spectrum')) {
        await snapshotSpectrum(figures);
    } else if (btn.id.endsWith('-poloidal')) {
        const res = await requestPlotData(
            gtc_instance.path,
            'plotType/Equilibrium',
            true
        );
        await (res.ok
            ? snapshotPoloidal(
                  gtc_instance,
                  figures,
                  getStatusBar(),
                  (
                      await (
                          await requestPlotData(
                              gtc_instance.path,
                              'data/Equilibrium-1D-rg_n-q',
                              true
                          )
                      ).json()
                  )
                      ?.at(0)
                      ?.data?.at(0)
              )
            : snapshotPoloidal(gtc_instance, figures, getStatusBar()));
    }
}

function updateHistoryModeRange(gtc_instance) {
    document
        .getElementById(`${default_figure_wrapper.id}-figure-2`)
        .on('plotly_relayout', function (eventData) {
            if (eventData['xaxis.range']) {
                gtc_instance.hist_range.growth_rate =
                    eventData['xaxis.range'].slice();
            } else if (eventData['xaxis.range[0]']) {
                gtc_instance.hist_range.growth_rate = [
                    eventData['xaxis.range[0]'],
                    eventData['xaxis.range[1]'],
                ];
            }
        });
    document
        .getElementById(`${default_figure_wrapper.id}-figure-3`)
        .on('plotly_relayout', function (eventData) {
            if (eventData['xaxis.range']) {
                gtc_instance.hist_range.frequency =
                    eventData['xaxis.range'].slice();
            } else if (eventData['xaxis.range[0]']) {
                gtc_instance.hist_range.frequency = [
                    eventData['xaxis.range[0]'],
                    eventData['xaxis.range[1]'],
                ];
            }
        });
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

            return Promise.all(
                GTCGlobals.map(async gtc_instance => {
                    gtc_instance.current_figure_id = `${type}-1D-${xType}-${yType}`;
                    await addLoadingIndicator(
                        getDataThenPlot.bind({
                            id: gtc_instance.current_figure_id,
                        })
                    )();
                })
            );
        })
    );
}

async function propagateFetchError(res) {
    if (!res.ok) {
        throw await res.text();
    }
}

function nodeIs(node, predict) {
    if (node) {
        return predict(node) || nodeIs(node.parentElement, predict);
    }
}

function constructFolderContentList(clear_func, parent, child) {
    const constructPath = entry => {
        return entry ? `${constructPath(entry.parent)}/${entry.dirname}` : '';
    };

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
                const gtc_output = constructPath(entry);
                if (document.querySelector('#select-compare-goto').checked) {
                    postForm('/plot', { gtc_output });
                } else {
                    clear_func();
                    wrap(addLoadingIndicator(requestForCompare))(gtc_output);
                }
            });
            const span = document.createElement('span');
            span.innerText = 'gtc.out';
            span.classList.add('output');
            li.appendChild(span);
        }

        if (entry.count.folders > 1) {
            // a folder contains subfolders
            li.classList.add('folder');
            li.appendChild(constructFolderContentList(clear_func, entry));
            li.addEventListener('click', event => {
                event.stopPropagation();
                event.currentTarget.classList.toggle('folder-expand');
            });
        }
        ul.appendChild(li);
    }

    return ul;
}

function postForm(url, content) {
    const form = document.createElement('form');
    form.method = 'post';
    form.action = url;

    for (const key in content) {
        if (content.hasOwnProperty(key)) {
            const hiddenField = document.createElement('input');
            hiddenField.type = 'hidden';
            hiddenField.name = key;
            hiddenField.value = content[key];

            form.appendChild(hiddenField);
        }
    }

    document.body.appendChild(form);
    form.submit();
}

async function requestForCompare(path) {
    GTCGlobals.push(
        new GTC_Instance(
            path,
            document.querySelector('#figure-wrapper-compare')
        )
    );

    // request server to check the selected gtc output folder
    const res = await fetch(`/plot`, {
        method: 'post',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            gtc_output: path,
        }).toString(),
    });
    await propagateFetchError(res);

    const gtc_instance = GTCGlobals[0];
    if (gtc_instance.current_panel) {
        // request server to read specific .out file
        const pt_res = await requestPlotData(
            path,
            `plotType/${gtc_instance.current_panel}`
        );
        await propagateFetchError(pt_res);
        const { id: btn_id_array } = await pt_res.json();

        const majorType = gtc_instance.current_panel.startsWith('snap')
            ? 'Snapshot'
            : gtc_instance.current_panel;
        // plot the same figure as the original gtc output folder if possible
        if (
            btn_id_array
                .flat()
                .map(id => `${majorType}-${id}`)
                .includes(gtc_instance.current_figure_id)
        ) {
            await getDataThenPlot.call(
                {
                    id: gtc_instance.current_figure_id,
                },
                GTCGlobals.at(-1)
            );
        }
    }
}

async function initialBreadcrumb() {
    const res = await fetch('/fileTree');
    await propagateFetchError(res);
    const { file_tree } = await res.json();
    const navigationBar = document.querySelector(
        '#breadcrumb-container'
    ).firstElementChild;
    const [root, ...pathname] = navigationBar.innerText.split('/');

    const pathSegments = [root, ...pathname].map(seg => {
        const span = document.createElement('span');
        span.classList.add('breadcrumb-item');
        const a = document.createElement('a');
        a.classList.add('breadcrumb-anchor');
        a.innerText = seg;
        span.appendChild(a);
        return span;
    });
    // navigationBar.innerText = root;
    navigationBar.after(...pathSegments);
    navigationBar.remove();

    // add drop down list
    const dropdown = document.createElement('div');
    dropdown.classList.add('breadcrumb-dropdown');
    const clearDropdown = () => {
        pathSegments.forEach(s => {
            s.classList.remove('active');
            for (const child of s.children) {
                child.classList.remove('active');
            }
        });
    };

    let currentEntry = undefined;
    pathSegments.forEach(seg => {
        const parentEntry = currentEntry;
        currentEntry = currentEntry
            ? currentEntry.content.find(
                  f => f.dirname === seg.firstElementChild.innerText
              )
            : file_tree;

        seg.appendChild(dropdown.cloneNode());
        seg.lastElementChild.append(
            constructFolderContentList(clearDropdown, parentEntry, currentEntry)
        );
        seg.addEventListener('click', event => {
            clearDropdown();
            for (const child of event.currentTarget.children) {
                child.classList.add('active');
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
}
