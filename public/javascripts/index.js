'use strict';
//TODO: Add progress indications when receiving data and making plot
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
                openPanel.call(swc);
            };
        }
    }

    // snapshot file name buttons
    for (let btn of document.getElementById('files').children) {
        btn.onclick = openPanel;
    }
});

window.addEventListener('error', () => {
    document.getElementById('status').status.err =
        'Oops, something wrong happened. ' +
        'Please consult javascript console for more info.';
});

function registerButtons(buttons) {
    // let buttons = document.getElementsByClassName('tab-l1-btn');
    for (let btn of buttons) {
        btn.onclick = getDataThenPlot;
    }
}

async function getBasicParameters() {
    if (!window.GTCGlobal.basicParameters) {
        let res = await fetch(`data/basicParameters`);
        window.GTCGlobal.basicParameters = await res.json();
    }
}

async function openPanel() {
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
            await getBasicParameters();
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
        // register buttons' callback functions
        // registerButtons();

        if (this.id === 'History') {
            await getBasicParameters();
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
                await history_mode(
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
        await history_mode(figures);
        window.GTCGlobal.hist_mode_range.frequency = undefined;
        window.GTCGlobal.hist_mode_range.growthRate = undefined;
        recal.style.height = '3.5rem';
    } else if (
        this.id.startsWith('Snapshot') &&
        this.id.endsWith('-spectrum')
    ) {
        await snapshot_spectrum(figures);
    } else if (
        this.id.startsWith('Snapshot') &&
        this.id.endsWith('-poloidal')
    ) {
        await snapshot_poloidal(figures);
    } else if (this.id.startsWith('Tracking')) {
        await tracking_plot(figures);
        return;
    } else if (this.id.startsWith('Equilibrium-1D-rg_n')) {
        figures.forEach(fig => {
            addSimulationRegion(fig);
        });
    }

    for (let i = 0; i < figures.length; i++) {
        Plotly.newPlot(`figure-${i + 1}`, figures[i].data, figures[i].layout, {
            editable: true,
        });
    }

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

async function history_mode(figures, interval1, interval2) {
    // import calculator
    let spectrum = await import('./spectrum.js');

    // deconstructing figures
    let [componentsFig, growthFig, freqFig, spectralFig] = figures;

    // growth rate figure
    let { gamma, measurePts } = spectrum.cal_gamma(
        growthFig.data[0].y,
        window.GTCGlobal.timeStep,
        interval1
    );
    growthFig.data[1] = {
        x: [measurePts[0].x, measurePts[1].x],
        y: [measurePts[0].y, measurePts[1].y],
        type: 'scatter',
        line: { dash: 'dot', color: 'rgb(245, 10, 10)', width: 3 },
        markers: { color: 'rgb(255, 0, 0)', size: 8 },
    };
    growthFig.layout.title = `$\\gamma=${gamma.toPrecision(5)}$`;
    growthFig.layout.xaxis.rangeslider = {
        bgcolor: 'rgb(200,200,210)',
    };

    // frequency figure
    let y0 = componentsFig.data[0].y[0];
    y0 = y0 == 0 ? 1 : y0;
    let yReals = componentsFig.data[0].y.map(
        (y, i) =>
            y / (Math.exp(gamma * (i + 1) * window.GTCGlobal.timeStep) * y0)
    );
    let yImages = componentsFig.data[1].y.map(
        (y, i) =>
            y / (Math.exp(gamma * (i + 1) * window.GTCGlobal.timeStep) * y0)
    );
    let omega;
    ({ omega, measurePts } = spectrum.cal_omega_r(
        yReals,
        yImages,
        window.GTCGlobal.timeStep,
        interval2
    ));
    freqFig.data[0] = {
        x: [...Array(yReals.length).keys()].map(
            i => (i + 1) * window.GTCGlobal.timeStep
        ),
        y: yReals,
        type: 'scatter',
        mode: 'lines',
    };
    freqFig.data[1] = {
        x: [...Array(yReals.length).keys()].map(
            i => (i + 1) * window.GTCGlobal.timeStep
        ),
        y: yImages,
        type: 'scatter',
        mode: 'lines',
    };
    freqFig.data[2] = {
        x: [measurePts[0].x, measurePts[1].x],
        y: [measurePts[0].y, measurePts[1].y],
        type: 'scatter',
        line: { dash: 'dot', color: 'rgb(245, 10, 10)', width: 3 },
        markers: { color: 'rgb(255, 0, 0)', size: 8 },
    };
    freqFig.layout.title = `$\\omega=${omega.toPrecision(5)}$`;
    freqFig.layout.xaxis.rangeslider = {
        bgcolor: 'rgb(200,200,210)',
    };

    // spectral figure
    let powerSpectrum = spectrum.cal_spectrum(
        yReals,
        yImages,
        window.GTCGlobal.timeStep
    );
    spectralFig.data[0] = Object.assign(powerSpectrum, {
        type: 'scatter',
        mode: 'lines',
    });
}

async function snapshot_spectrum(figures) {
    let field = figures.pop().extraData;
    let torNum = field.length;
    let polNum = field[0].length;

    let mmode = Math.floor(polNum / 5);
    let pmode = Math.floor(torNum / 5);

    let poloidalSpectrum = Array(mmode).fill(0);
    for (let section of field) {
        let powerSpectrum = window.GTCGlobal.Fourier.spectrum(section);
        poloidalSpectrum[0] += powerSpectrum[0];
        for (let i = 1; i < mmode; i++) {
            poloidalSpectrum[i] += powerSpectrum[i] + powerSpectrum[polNum - i];
        }
    }
    poloidalSpectrum = poloidalSpectrum.map(
        v => Math.sqrt(v / torNum) / polNum
    );

    let toroidalSpectrum = Array(pmode).fill(0);
    for (let section of transpose(field)) {
        let powerSpectrum = window.GTCGlobal.Fourier.spectrum(section);
        toroidalSpectrum[0] += powerSpectrum[0];
        for (let i = 1; i < pmode; i++) {
            toroidalSpectrum[i] += powerSpectrum[i] + powerSpectrum[torNum - i];
        }
    }
    toroidalSpectrum = toroidalSpectrum.map(
        v => Math.sqrt(v / polNum) / torNum
    );

    figures[0].data[0].x = [...Array(mmode).keys()];
    figures[0].data[0].y = poloidalSpectrum;

    figures[1].data[0].x = [...Array(pmode).keys()];
    figures[1].data[0].y = toroidalSpectrum;
}

function snapshot_poloidal(figures) {
    const { polNum, radNum } = figures.pop();
    const flattenedField = figures[0].data[1].z;
    const modeNum = polNum / 10;

    const spectrum_figure_data = figures[1].data;
    for (let i = 0; i < modeNum; i++) {
        spectrum_figure_data.push({
            y: [],
            name: `m = ${i}`,
            showlegend: false,
            hoverinfo: 'none',
            total: 0,
        });
    }
    for (let r = 0; r < radNum; r++) {
        const circle = flattenedField.slice(r * polNum, (r + 1) * polNum);
        Array.from(
            window.GTCGlobal.Fourier.spectrum(circle).slice(0, modeNum)
        ).forEach((amp, i) => {
            spectrum_figure_data[i].y.push(amp);
            spectrum_figure_data[i].total += amp;
        });
    }
    spectrum_figure_data
        .sort((u, v) => {
            return v.total - u.total;
        })
        .some((d, i) => {
            d.showlegend = true;
            return i > 6;
        });
}

async function tracking_plot(figures) {
    const zeta = figures.pop().extraData;

    const figureDiv1 = document.getElementById('figure-1');
    await Plotly.newPlot(figureDiv1, figures[0]);

    // Plotly will do the spline for me
    const [carpet, scatter] = figureDiv1.calcdata;

    Object.assign(figures[1].data[0], {
        x: scatter.map(({ x }, i) => x * Math.cos(zeta[i])),
        y: scatter.map(({ x }, i) => x * Math.sin(zeta[i])),
        z: scatter.map(({ y }) => y),
    });

    Plotly.newPlot('figure-2', figures[1]);
}

function transpose(matrix) {
    let result = new Array(matrix[0].length);
    for (let i = 0; i < result.length; i++) {
        result[i] = matrix.map(line => line[i]);
    }
    return result;
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
    form.addEventListener('submit', async event => {
        event.preventDefault();

        const data = new FormData(form);
        const type = 'Equilibrium';

        const xType = data.get('x');
        const yType = data.get('y');

        if (!xType || !yType) {
            alert('Choose X and Y');
            return;
        }

        getDataThenPlot.call({ id: `${type}-1D-${xType}-${yType}` });
    });
}

function addSimulationRegion(fig) {
    const [rg0, rg1] = window.GTCGlobal.basicParameters.radial_region;
    const data = fig.data[0].y;

    let y_min = Infinity,
        y_max = -Infinity;
    data.forEach(y => {
        if (y_min > y) {
            y_min = y;
        }
        if (y_max < y) {
            y_max = y;
        }
    });
    const sep_props = {
        y: [y_min - 0.2 * (y_max - y_min), y_max + 0.2 * (y_max - y_min)],
        mode: 'lines',
        line: {
            color: 'rgb(143, 177, 50)',
            width: 3,
        },
    };
    fig.data.push(
        {
            x: [rg0, rg0],
            ...sep_props,
        },
        {
            x: [rg1, rg1],
            fill: 'tonextx',
            ...sep_props,
        }
    );

    fig.layout.yaxis.range = [
        y_min - 0.1 * (y_max - y_min),
        y_max + 0.1 * (y_max - y_min),
    ];
    fig.layout.showlegend = false;
}
