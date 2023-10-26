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
        this.orig = root.innerText;
        root.status = this;
    }
    toString() {
        return (
            `${this.orig}<br>` +
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
window.GTCGlobal = new Object();

// use for history mode interaction
window.GTCGlobal.hist_mode_range = {
    growthRate: undefined,
    frequency: undefined,
};

window.addEventListener('load', function () {
    new StatusBar(document.getElementById('status'));
    addClosingX();

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
                    let div = document.getElementById('files');
                    div.style.height = '';
                    await addLoadingIndicator(callEventTarget(openPanel))(e);
                })
            );
        }
    }

    // snapshot file name buttons
    for (let btn of document.getElementById('files').children) {
        btn.addEventListener(
            'click',
            wrap(addLoadingIndicator(callEventTarget(openPanel)))
        );
    }

    addDownloadFunction();
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
    if (!window.location.pathname.startsWith('/local')) {
        downloadForm.style.visibility = 'inherit';
        return;
    }
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

function registerButtons(buttons) {
    buttons.forEach(btn => {
        btn.addEventListener(
            'click',
            wrap(addLoadingIndicator(callEventTarget(getDataThenPlot)))
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

async function openPanel() {
    if (this.id == 'Summary') {
        await getBasicParameters();
        const summaryContainer = await generateSummary();

        if (summaryContainer === undefined) {
            // summary page is already generated
            return;
        }

        // register jump button on summary page
        summaryContainer
            .querySelectorAll('.summary-jump-button')
            .forEach(btn => {
                btn.addEventListener(
                    'click',
                    wrap(async e => {
                        e.preventDefault();
                        const panelSwitch = document.querySelector(
                            `#${btn.id.split('-')[1]}`
                        );
                        await addLoadingIndicator(
                            openPanel.bind(panelSwitch)
                        )();

                        panelSwitch.checked = true;
                        document.querySelector(`#${btn.id.slice(8)}`).click();
                    })
                );
            });
        return;
    }

    // link radio id to panel id
    let majorType = this.id.startsWith('snap') ? 'Snapshot' : this.id;
    let panelName = `${majorType}-panel`;

    // modifies status bar
    const statusBar = document.getElementById('status').status;

    cleanPanel();
    cleanPlot();
    let panel = document.getElementById(panelName);
    panel.style.opacity = 1;
    panel.style.zIndex = 2;

    // inform the server about which .out file should be parsed
    let res = await fetch(
        `plot/plotType/${this.id}?dir=${
            document.querySelector('#outputTag').innerText
        }`
    );
    await propagateFetchError(res);
    // wait for the response, then create buttons for plotting
    await getBasicParameters();

    let { info, warn, err, id: btn_id_array } = await res.json();
    statusBar.info = info ? info : '';
    statusBar.warn = warn ? warn : '';
    if (err) {
        statusBar.err = err;
        return;
    }

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
    btn_id_array.map(type => {
        let subDiv = document.createElement('div');
        const btns = type.map(btnID => {
            let btn = document.createElement('button');
            btn.setAttribute('id', `${majorType}-${btnID}`);
            btn.setAttribute('class', 'tab-l1-btn');
            btn.innerText = btnID;
            subDiv.appendChild(btn);

            return btn;
        });
        registerButtons(btns);
        panel.appendChild(subDiv);
    });

    if (this.id === 'History') {
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
        btn.addEventListener('click', async function () {
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
        });

        div.classList.add('dropdown');
        div.append(btn);
        panel.prepend(div);
    }
}

function cleanPlot() {
    for (let fig of document.getElementById('figure-wrapper').children) {
        fig.innerHTML = '';
    }
}

function cleanPanel() {
    const panel = document.getElementById('panel');
    for (let p of panel.children) {
        p.style.opacity = 0;
        p.style.zIndex = 1;
    }

    const recal = panel.querySelector('#History-panel').firstElementChild;
    if (recal) {
        recal.style.height = '0rem';
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

async function getDataThenPlot() {
    cleanPlot();

    const res = await fetch(
        `plot/data/${this.id}?dir=${
            document.querySelector('#outputTag').innerText
        }`
    );
    await propagateFetchError(res);
    let figures = await res.json();

    // some figures need some local calculation
    const recal = document.getElementById('History-panel').firstElementChild;
    if (this.id.startsWith('History')) {
        recal.style.height = '0rem';
    }
    if (this.id.startsWith('History') && this.id.includes('-mode')) {
        await historyMode(figures);
        window.GTCGlobal.hist_mode_range.frequency = undefined;
        window.GTCGlobal.hist_mode_range.growthRate = undefined;
        recal.style.height = '3.5rem';
    } else if (
        this.id.startsWith('Snapshot') &&
        this.id.endsWith('-spectrum')
    ) {
        await snapshotSpectrum(figures);
    } else if (
        this.id.startsWith('Snapshot') &&
        this.id.endsWith('-poloidal')
    ) {
        snapshotPoloidal(figures);
    } else if (this.id.startsWith('Tracking')) {
        await trackingPlot(figures);
        return;
    } else if (this.id.startsWith('Equilibrium-1D-rg_n')) {
        figures.forEach(fig => {
            addSimulationRegion(fig);
        });
    }

    await Promise.all(
        figures.map(({ data, layout }, idx) =>
            Plotly.newPlot(`figure-${idx + 1}`, data, layout, {
                editable: true,
            })
        )
    );

    if (this.id.startsWith('History') && this.id.includes('-mode')) {
        document
            .getElementById('figure-2')
            .on('plotly_relayout', function (eventData) {
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
    // propagates error event to window
    if (!res.ok) {
        throw await res.text();
    }
}

function addClosingX() {
    const isTopLevel = () => {
        try {
            return window.self === window.top;
        } catch (e) {
            return false;
        }
    };
    // top level window, do nothing
    if (isTopLevel()) {
        return;
    }
    const x = document.createElement('button');
    x.id = 'close-button';
    x.innerText = 'X';
    x.addEventListener('click', () => {
        const topWindow = window.top;
        topWindow.navigator.serviceWorker.ready.then(reg => {
            reg.active.postMessage({ opening: false });
        });
        // close iframe
        topWindow.document.body.removeChild(
            topWindow.document.getElementsByTagName('iframe')[0]
        );
        // clear file input
        topWindow.document.querySelector('#local_file_picker').value = '';
    });
    document.body.append(x);
}
