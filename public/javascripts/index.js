'use strict'
//TODO: Add progress indications when receiving data and making plot

// register plot type tabs
let switches = document.getElementsByClassName('tab-l0-switch');
let switchState = {};
for (let swc of switches) {
    switchState[swc.id] = 'untouched';
    if (swc.id === 'Snapshot') {
        swc.onchange = function () {
            // expand snapshot file list
            let div = document.getElementById('files')
            div.style.height = `${div.childElementCount * 1.2 + 0.2}rem`;
            div.style.opacity = 1;
            for (let btn of div.children) {
                btn.style.visibility = 'visible';
            }
            cleanPanel();
        }
    } else {
        swc.onchange = function () {
            // collapse snapshot file list
            let div = document.getElementById('files');
            div.style.height = '0rem';
            div.style.opacity = 0;
            for (let btn of div.children) {
                btn.style.visibility = 'hidden';
            }
            openPanel(swc.id);
        }
    }
}

// snapshot file name buttons
for (let btn of document.getElementById('files').children) {
    btn.onclick = function () {
        openPanel(btn.id)
    }
}

function registerButtons() {
    let buttons = document.getElementsByClassName('tab-l1-btn');
    for (let btn of buttons) {
        let id = btn.id
        if (id.startsWith('History') && id.includes('_mode')) {
            // field mode figures need some local calculation
            btn.onclick = history_mode;
        } else if (id.includes('_spectrum')) {
            // same as above
            btn.onclick = snapshot_spectrum;
        } else {
            btn.onclick = async () => {
                cleanPlot();

                let figObj = await fetch(`data/${id}`);
                let figures = await figObj.json();

                for (let i = 0; i < figures.length; i++) {
                    Plotly.newPlot(`figure-${i + 1}`, figures[i].data, figures[i].layout);
                }
            }
        }
    }
}

/**
 * 
 * @param {string} id 
 */
async function openPanel(id) {
    // link radio id to panel id    
    let majorType = id.startsWith('snap') ? 'Snapshot' : id;
    let panelName = `${majorType}-panel`;

    // modifies status bar
    if (majorType === 'Snapshot') {
        let info = document.body.children[0];
        info.innerText = `${info.innerText.split('\n')[0]}
            Currently selection of Snapshot file: ${id}`;
    } else {
        let info = document.body.children[0];
        info.innerText = info.innerText.split('\n')[0]
    }

    cleanPanel();
    cleanPlot();
    let panel = document.getElementById(panelName)
    panel.style.opacity = 1;
    panel.style.zIndex = 2;

    // inform the server about which .out file should be parsed
    let res = await fetch(`plotType/${id}`);
    // wait for the response, then create buttons for plotting
    if (res.ok) {
        let { info, id: btn_id_array } = await res.json();
        console.log(`server: ${info}`);

        // add buttons
        if (switchState[majorType] === 'untouched') {
            switchState[majorType] = 'touched';
        } else {
            return;
        }

        // Equilibrium panel needs special care
        if (id === 'Equilibrium') {
            let { xDataTypes, yDataTypes, poloidalPlanePlotTypes, otherPlotTypes } = btn_id_array;
            btn_id_array = [poloidalPlanePlotTypes, otherPlotTypes];
            createEqPanel1D(xDataTypes, yDataTypes);
        }
        btn_id_array.forEach(type => {
            let subDiv = document.createElement('div')
            type.forEach(btnID => {
                let btn = document.createElement('button');
                btn.setAttribute('id', `${majorType}-${btnID}`);
                btn.setAttribute('class', 'tab-l1-btn');
                btn.innerText = btnID;
                subDiv.appendChild(btn);
            })
            panel.appendChild(subDiv)
        });
        // register buttons' callback functions
        registerButtons();

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
    let panel = document.getElementById('panel');
    for (let p of panel.children) {
        p.style.opacity = 0;
        p.style.zIndex = 1;
        // p.style.width = 0;
        // p.style.height = 0;
    }
}

async function history_mode() {
    cleanPlot();

    let figObj = await fetch(`data/${this.id}`);
    let figures = await figObj.json();

    // Request some basic parameters for calculating growth rate and frequency
    let bpRes = await fetch(`data/basicParameters`);
    let { ndiag, tstep } = await bpRes.json();
    let timeStep = ndiag * tstep;

    // import calculator
    let spectrum = await import('./spectrum.js');

    // deconstructing figures
    let [componentsFig, growthFig, freqFig, spectralFig] = figures;

    // growth rate figure
    let { gamma, measurePts } = spectrum.cal_gamma(growthFig.data[0].y, timeStep);
    growthFig.data.push({
        x: [measurePts[0].x, measurePts[1].x],
        y: [measurePts[0].y, measurePts[1].y],
        type: 'scatter',
        line: { dash: 'dot', color: 'rgb(245, 10, 10)', width: 3 },
        markers: { color: 'rgb(255, 0, 0)', size: 8 }
    });
    growthFig.layout.title = `gamma=${gamma}`;

    // frequency figure
    let y0 = componentsFig.data[0].y[0];
    let yReals = componentsFig.data[0].y
        .map((y, i, arr) => y / (Math.exp(gamma * (i + 1) * timeStep) * y0));
    let yImages = componentsFig.data[1].y
        .map((y, i) => y / (Math.exp(gamma * (i + 1) * timeStep) * y0));
    let omega;
    ({ omega, measurePts } = spectrum.cal_omega_r(yReals, timeStep));
    freqFig.data.push({
        x: [...Array(yReals.length).keys()].map(i => (i + 1) * timeStep),
        y: yReals,
        type: 'scatter',
        mode: 'lines'
    });
    freqFig.data.push({
        x: [...Array(yReals.length).keys()].map(i => (i + 1) * timeStep),
        y: yImages,
        type: 'scatter',
        mode: 'lines'
    });
    freqFig.data.push({
        x: [measurePts[0].x, measurePts[1].x],
        y: [measurePts[0].y, measurePts[1].y],
        type: 'scatter',
        line: { dash: 'dot', color: 'rgb(245, 10, 10)', width: 3 },
        markers: { color: 'rgb(255, 0, 0)', size: 8 }
    });
    freqFig.layout.title = `omega=${omega}`;

    // spectral figure
    let powerSpectrum = await spectrum.cal_spectrum(yReals, yImages, timeStep);
    spectralFig.data.push(
        Object.assign(powerSpectrum, {
            type: 'scatter',
            mode: 'lines'
        })
    )


    // invoke Plotly
    for (let i = 0; i < figures.length; i++) {
        Plotly.newPlot(`figure-${i + 1}`, figures[i].data, figures[i].layout);
    }
}

async function snapshot_spectrum() {
    const fft = await import('./jsfft/fft.js');

    let figObj = await fetch(`data/${this.id}`);
    let figures = await figObj.json();

    let field = figures.pop().extraData;
    let torNum = field.length;
    let polNum = field[0].length;

    let mmode = Math.floor(polNum / 5);
    let pmode = Math.floor(torNum / 5);

    let poloidalSpectrum = Array(mmode).fill(0);
    for (let section of field) {
        let powerSpectrum = fft.FFT(section).magnitude();
        poloidalSpectrum[0] += powerSpectrum[0];
        for (let i = 1; i < mmode; i++) {
            poloidalSpectrum[i] += powerSpectrum[i] + powerSpectrum[polNum - i]
        }
    }
    poloidalSpectrum = poloidalSpectrum.map(v => Math.sqrt(v / torNum) / polNum);

    let toroidalSpectrum = Array(pmode).fill(0);
    for (let section of transpose(field)) {
        let powerSpectrum = fft.FFT(section).magnitude();
        toroidalSpectrum[0] += powerSpectrum[0];
        for (let i = 1; i < pmode; i++) {
            toroidalSpectrum[i] += powerSpectrum[i] + powerSpectrum[torNum - i]
        }
    }
    toroidalSpectrum = toroidalSpectrum.map(v => Math.sqrt(v / polNum) / torNum);

    figures[0].data[0].x = [...Array(mmode).keys()];
    figures[0].data[0].y = poloidalSpectrum;

    figures[1].data[0].x = [...Array(pmode).keys()];
    figures[1].data[0].y = toroidalSpectrum;

    for (let i = 0; i < figures.length; i++) {
        Plotly.newPlot(`figure-${i + 1}`, figures[i].data, figures[i].layout);
    }
}

function transpose(matrix) {
    let result = new Array(matrix[0].length);
    for (let i = 0; i < result.length; i++) {
        result[i] = matrix.map(line => line[i])
    }
    return result;
}

function createEqPanel1D(xDataTypes, yDataTypes) {

    const xDiv = document.getElementById('eq-x');
    const yDiv = document.getElementById('eq-y');

    const xTitle = document.createElement('header');
    const yTitle = document.createElement('header');
    xTitle.innerText = 'X';
    yTitle.innerText = 'Y';
    xDiv.appendChild(xTitle);
    yDiv.appendChild(yTitle);

    // add x group radio buttons
    xDataTypes.forEach(xData => {
        let input = document.createElement('input');
        Object.assign(input, {
            id: `x-${xData}`,
            value: xData,
            type: 'radio',
            name: 'x',
            className: 'eq-1d-x'
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
            className: 'eq-1d-y'
        });

        let label = document.createElement('label');
        label.setAttribute('for', `y-${yData}`);
        label.innerText = yData;

        yDiv.appendChild(input);
        yDiv.appendChild(label);
    });

    // register form submit behaviour
    const form = document.getElementById('Equilibrium-panel').firstElementChild.firstElementChild;
    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const data = new FormData(form);
        const type = 'Equilibrium';

        const xType = data.get('x');
        const yType = data.get('y');

        if (!xType || !yType) {
            alert('Choose X and Y');
            return;
        }

        let figObj = await fetch(`data/${type}-1D-${xType}-${yType}`);
        let figures = await figObj.json();

        for (let i = 0; i < figures.length; i++) {
            Plotly.newPlot(`figure-${i + 1}`, figures[i].data, figures[i].layout);
        }
    })
}