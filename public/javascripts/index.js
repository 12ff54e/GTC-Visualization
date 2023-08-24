'use strict';
import {
    historyMode,
    snapshotPoloidal,
    snapshotSpectrum,
    trackingPlot,
    addSimulationRegion
} from './plot-data-process.js';
import Wasm from './wasm_loader.js';

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

// load wasm fft module

window.addEventListener('load', async function () {
    new StatusBar(document.getElementById('status'));
    this.GTCGlobal.Fourier = await Wasm.instantiate('/webassembly/fft.wasm');

    // register plot type tabs
    for (let swc of document.getElementsByClassName('tab-l0-switch')) {
        swc.visited = false;
        if (swc.id === 'Snapshot') {
            swc.onchange = function () {
                // expand snapshot file list
                let div = document.getElementById('files');
                div.style.height = `${div.childElementCount * 1.3 + 0.2}rem`;
                cleanPlot();
                cleanPanel();
            };
        } else {
            swc.onchange = function () {
                // collapse snapshot file list
                let div = document.getElementById('files');
                div.style.height = '';
                addLoadingIndicator.call(swc, openPanel).catch(err => {
                    console.error(err);
                    getStatusBar().err = StatusBar.DEFAULT_ERROR;
                });
            };
        }
    }

    // snapshot file name buttons
    for (let btn of document.getElementById('files').children) {
        btn.addEventListener('click', e => {
            addLoadingIndicator.call(e.target, openPanel).catch(err => {
                console.error(err);
                getStatusBar().err = StatusBar.DEFAULT_ERROR;
            });
        });
    }
});

window.addEventListener('error', () => {
    getStatusBar().err = StatusBar.DEFAULT_ERROR;
});

function registerButtons(buttons) {
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            addLoadingIndicator.call(btn, getDataThenPlot).catch(err => {
                console.error(err);
                getStatusBar().err = StatusBar.DEFAULT_ERROR;
            });
        });
    });
}

async function getBasicParameters() {
    if (!window.GTCGlobal.basicParameters) {
        let res = await fetch(`data/basicParameters`);
        window.GTCGlobal.basicParameters = await res.json();
    }
}

async function openPanel() {
    if (this.id == 'Summary') {
        await generateSummary();
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
    let res = await fetch(`plotType/${this.id}`);
    // wait for the response, then create buttons for plotting
    if (res.ok) {
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
                const len =
                    figures[0].data[0].x[figures[0].data[0].x.length - 1];
                await historyMode(
                    figures,
                    window.GTCGlobal.hist_mode_range.growthRate &&
                        window.GTCGlobal.hist_mode_range.growthRate.map(
                            i => i / len
                        ),
                    window.GTCGlobal.hist_mode_range.frequency &&
                        window.GTCGlobal.hist_mode_range.frequency.map(
                            i => i / len
                        )
                );

                figures.forEach(figure => {
                    Plotly.react(figure, figure.data, figure.layout);
                });
            });

            div.classList.add('dropdown');
            div.append(btn);
            panel.prepend(div);
        }
    } else {
        alert(`ERROR, CODE: ${res.status}`);
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

    document.querySelector('#container').style.visibility = 'hidden';
}

async function addLoadingIndicator(func) {
    const loading = document.querySelector('#loading');
    loading.style.visibility = 'visible';

    await func.call(this);

    loading.style.visibility = 'hidden';
}

async function getDataThenPlot() {
    cleanPlot();

    let figObj = await fetch(`data/${this.id}`);
    let figures = await figObj.json();

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
    form.addEventListener('submit', event => {
        event.preventDefault();

        const data = new FormData(form);
        const type = 'Equilibrium';

        const xType = data.get('x');
        const yType = data.get('y');

        if (!xType || !yType) {
            alert('Choose X and Y');
            return;
        }

        addLoadingIndicator
            .call(
                {
                    id: `${type}-1D-${xType}-${yType}`,
                },
                getDataThenPlot
            )
            .catch(err => {
                console.log(err);
                getStatusBar().err = StatusBar.DEFAULT_ERROR;
            });
    });
}

async function generateSummary() {
    getStatusBar().warn = 'Not implemented yet.';

    const container = document.querySelector('#container');
    container.style.visibility = 'visible';
    const summary = container.firstElementChild;
    if (summary.childElementCount != 0) {
        return;
    }

    await getBasicParameters();
    const res = await fetch('Summary');
    if (!res.ok) {
        throw `ERROR, CODE: ${res.status}`;
    }

    const data = await res.json();
    const minorRadius = data.rg.at(-1);

    const addParagraph = str => {
        summary.appendChild(document.createElement('p')).innerText = str;
    };

    const bp = GTCGlobal.basicParameters;
    const basicInfo = `This is a ${bp.nonlinear ? 'non' : ''}linear electro${
        bp.magnetic ? 'magnetic' : 'static'
    } run. The equilibrium is ${
        bp.numereq ? 'numeric' : 'analytic'
    } with a major radius of \\(${(bp.r0 / 100).toPrecision(
        4
    )}\\text{m}\\), minor radius of \\(${(
        (minorRadius * bp.r0) /
        100
    ).toPrecision(4)}\\text{m}\\)(\\(\\epsilon=${minorRadius.toPrecision(
        4
    )}\\)) and axis magnetic field strength of \\(${(bp.b0 / 10000).toPrecision(
        4
    )}\\text{T}\\)`;
    addParagraph(basicInfo);

    const rgDiag =
        lerp(...bp.radial_region, bp.diag_flux / bp.mpsi) * minorRadius;
    const eqRadialDiagIndex = lower_bound(data.rg, rgDiag) - 1;
    const safetyFactor = linearMap(
        rgDiag,
        data.rg[eqRadialDiagIndex],
        data.rg[eqRadialDiagIndex + 1],
        data.q[eqRadialDiagIndex],
        data.q[eqRadialDiagIndex + 1]
    );
    const properModeIndex = bp.nmodes.reduce(
        (acc, val, idx) => {
            const { eps } = acc;
            const delta = Math.abs(bp.mmodes[idx] / val - safetyFactor);
            return eps > delta ? { eps: delta, minIdx: idx } : acc;
        },
        { minIdx: 0, eps: Infinity }
    ).minIdx;
    const diagFluxProp = `The diagnostic flux you choose locates at \\(${(
        rgDiag / minorRadius
    ).toPrecision(4)}a_0\\). Here safety factor \\(q=${safetyFactor.toPrecision(
        4
    )}\\), shear \\(\\hat{s}=r\\mathrm{d\\,ln}q/\\mathrm{d}r=${(
        (interpolationDerivative(rgDiag, data.rg, data.q) * rgDiag) /
        safetyFactor
    ).toFixed(4)}\\). Among 8 modes you choose, the ${properModeIndex + 1}${
        properModeIndex == 0 ? 'st' : properModeIndex == 1 ? 'nd' : 'th'
    } one (\\(m/n=${bp.mmodes[properModeIndex]}/${
        bp.nmodes[properModeIndex]
    }\\)) matches safety factor at diagnostic surface best.`;
    addParagraph(diagFluxProp);

    const driveDetails = ``;
    addParagraph(driveDetails);

    // renders math expression
    MathJax.Hub.Typeset(summary);
}

function lerp(a, b, x) {
    return a + (b - a) * x;
}

function linearMap(x, a0, b0, a1, b1) {
    return lerp(a1, b1, (x - a0) / (b0 - a0));
}

function lower_bound(array, val) {
    let idx = 0;
    let step = array.length;

    while (step > 0) {
        const half = Math.floor(step / 2);
        if (array[idx + half] > val) {
            step = half;
        } else {
            idx = idx + half + 1;
            step = step - half - 1;
        }
    }

    return idx;
}

function interpolationDerivative(x, xs, ys) {
    const idx = lower_bound(xs, x) - 1;

    let d = 0;
    if (idx == 0 || idx == xs.length - 2) {
        d = (ys[idx + 1] - ys[idx]) / (xs[idx + 1] - xs[idx]);
    } else {
        const threePairSum = (a, b, c) => {
            return a * b + b * c + c * a;
        };
        const x3 = 3 * x * x;
        const xSum = xs[idx - 1] + xs[idx] + xs[idx + 1] + xs[idx + 2];
        for (let i = 0; i < 4; ++i) {
            const localXS = xs.slice(idx - 1, idx + 3);
            const [localX] = localXS.splice(i, 1);
            let coef = x3 - 2 * x * (xSum - localX) + threePairSum(...localXS);
            coef /= localXS.reduce((acc, val) => acc * (localX - val), 1);
            d += coef * ys[idx - 1 + i];
        }
    }

    return d;
}
