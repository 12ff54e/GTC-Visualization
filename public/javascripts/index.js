'use strict';
import {
    historyMode,
    snapshotPoloidal,
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

// global vars
//  {
//      hist_mode_range;
//      basicParameters;
//      timeStep;
//      current_snapshot_id;
//      current_snapshot_figure_id;
//  }
window.GTCGlobal = new Object();

// use for history mode interaction
window.GTCGlobal.hist_mode_range = {
    growthRate: undefined,
    frequency: undefined,
};

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
                cleanPlot();
                cleanPanel();
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
                window.GTCGlobal.current_snapshot = e.target;
                await addLoadingIndicator(callEventTarget(openPanel))(e);
            })
        );
    }

    addDownloadFunction();

    // initial breadcrumb
    wrap(async () => {
        const res = await fetch('/fileTree');
        await propagateFetchError(res);
        const { file_tree } = await res.json();
        const navigationBar = document.querySelector(
            '#breadcrumb-container'
        ).firstElementChild;
        const [root, ...pathname] = navigationBar.innerText.split('/');

        const constructPath = entry => {
            return entry
                ? `${constructPath(entry.parent)}/${entry.dirname}`
                : '';
        };

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
        pathSegments.forEach(seg => {
            const parentEntry = currentEntry;
            currentEntry = currentEntry
                ? currentEntry.content.find(
                      f => f.dirname === seg.firstElementChild.innerText
                  )
                : file_tree;

            seg.appendChild(dropdown.cloneNode());
            seg.lastElementChild.append(
                constructFolderContentList(parentEntry, currentEntry)
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
    })();
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
        btn.addEventListener(
            'click',
            wrap(addLoadingIndicator(callEventTarget(cb)))
        );
    });
}

async function getBasicParameters() {
    if (!window.GTCGlobal.basicParameters) {
        const res = await fetch(
            `plot/data/basicParameters?dir=${
                document.querySelector('#outputTag').innerText
            }`
        );
        await propagateFetchError(res);
        window.GTCGlobal.basicParameters = await res.json();
    }
}

async function openPanel(clean_beforehand = true) {
    if (this.id == 'Summary') {
        await buildSummaryPage();
        return;
    }

    // link radio id to panel id
    let majorType = this.id.startsWith('snap') ? 'Snapshot' : this.id;
    let panelName = `${majorType}-panel`;

    // modifies status bar
    const statusBar = document.getElementById('status').status;

    cleanPanel();
    if (clean_beforehand) {
        cleanPlot();
    }
    let panel = document.getElementById(panelName);
    panel.style.opacity = 1;
    panel.style.zIndex = 2;

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
    }
}

async function buildSummaryPage() {
    await getBasicParameters();
    const summaryContainer = await generateSummary(getStatusBar());

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
    if (!window.GTCGlobal.timeStep) {
        window.GTCGlobal.timeStep =
            window.GTCGlobal.basicParameters.ndiag *
            window.GTCGlobal.basicParameters.tstep;
    }

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
        })
    );

    div.classList.add('dropdown');
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
                    let current_snapshot = GTCGlobal.current_snapshot;
                    if (i > 0) {
                        await new Promise(resolve => {
                            setTimeout(resolve, 200);
                        });
                    }
                    if (this.innerText.startsWith('prev')) {
                        if (current_snapshot.previousElementSibling) {
                            GTCGlobal.current_snapshot =
                                current_snapshot.previousElementSibling;
                        } else {
                            if (i == 0) {
                                alert('No previous snapshot');
                            }
                            return;
                        }
                    } else {
                        if (current_snapshot.nextElementSibling) {
                            GTCGlobal.current_snapshot =
                                current_snapshot.nextElementSibling;
                        } else {
                            if (i == 0) {
                                alert('No next snapshot');
                            }
                            return;
                        }
                    }
                    current_snapshot.classList.remove('snapshot-selected');
                    GTCGlobal.current_snapshot.classList.add(
                        'snapshot-selected'
                    );
                    await openPanel.call(GTCGlobal.current_snapshot, false);
                    if (GTCGlobal.current_snapshot_figure) {
                        await getDataThenPlot.call(
                            GTCGlobal.current_snapshot_figure,
                            false
                        );
                    }
                }
                window.removeEventListener('keypress', stopper);
            }
        )
    );
}

async function requestPlotData(name, optional = false) {
    // inform the server about which .out file should be parsed
    let res = await fetch(
        `plot/${name}?dir=${document.querySelector('#outputTag').innerText}`
    );
    try {
        await propagateFetchError(res);
    } catch (e) {
        if (!optional) {
            throw e;
        }
    }
    return res;
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

async function getDataThenPlot(clean_beforehand = true) {
    if (clean_beforehand) {
        cleanPlot();
    }

    const res = await fetch(
        `plot/data/${this.id}?dir=${
            document.querySelector('#outputTag').innerText
        }`
    );
    await propagateFetchError(res);
    let figures = await res.json();

    // some figures need some local calculation
    const recalculate =
        document.getElementById('History-panel').firstElementChild;
    if (this.id.startsWith('History')) {
        recalculate.style.height = '0rem';
    }
    if (this.id.startsWith('History') && this.id.includes('-mode')) {
        await historyMode(figures);
        window.GTCGlobal.hist_mode_range.frequency = undefined;
        window.GTCGlobal.hist_mode_range.growthRate = undefined;
        recalculate.style.height = '3.5rem';
    } else if (this.id.startsWith('Snapshot')) {
        await snapshotPreprocess(this, figures);
    } else if (this.id.startsWith('Tracking')) {
        await trackingPlot(figures);
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

    if (this.id.startsWith('History') && this.id.includes('-mode')) {
        if (!window.GTCGlobal.hist_mode_range.ev_listener_added) {
            updateHistoryModeRange();
        }
        window.GTCGlobal.hist_mode_range.ev_listener_added = true;
    }
}

async function snapshotPreprocess(btn, figures) {
    if (btn.id.endsWith('-spectrum')) {
        await snapshotSpectrum(figures);
    } else if (btn.id.endsWith('-poloidal')) {
        const res = await requestPlotData('plotType/Equilibrium', true);
        await (res.ok
            ? snapshotPoloidal(
                  figures,
                  getStatusBar(),
                  (
                      await (
                          await requestPlotData(
                              'data/Equilibrium-1D-rg_n-q',
                              true
                          )
                      ).json()
                  )
                      ?.at(0)
                      ?.data?.at(0)
              )
            : snapshotPoloidal(figures, getStatusBar()));
        
    }
    GTCGlobal.current_snapshot_figure = btn;
}

function updateHistoryModeRange() {
    document
        .getElementById('figure-2')
        .on('plotly_relayout', function (eventData) {
            console.log(eventData);
            if (eventData['xaxis.range']) {
                window.GTCGlobal.hist_mode_range.growthRate =
                    eventData['xaxis.range'].slice();
            } else if (eventData['xaxis.range[0]']) {
                window.GTCGlobal.hist_mode_range.growthRate = [
                    eventData['xaxis.range[0]'],
                    eventData['xaxis.range[1]'],
                ];
            }
        });
    document
        .getElementById('figure-3')
        .on('plotly_relayout', function (eventData) {
            console.log(eventData);
            if (eventData['xaxis.range']) {
                window.GTCGlobal.hist_mode_range.frequency =
                    eventData['xaxis.range'].slice();
            } else if (eventData['xaxis.range[0]']) {
                window.GTCGlobal.hist_mode_range.frequency = [
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

            await addLoadingIndicator(
                getDataThenPlot.bind({
                    id: `${type}-1D-${xType}-${yType}`,
                })
            )();
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
