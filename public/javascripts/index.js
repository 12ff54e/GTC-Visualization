'use strict'

let panels = document.getElementById('panel').children;
// register plot type tabs
let switches = document.getElementsByClassName('tab-l0-switch');
let switchState = {};
for (let swc of switches) {
    switchState[swc.id] = 'untouched';
    // TODO: use one function referred by switches, instead of creating copies
    swc.onchange = async function () {
        // link radio id to panel id
        let panelName = `${swc.id}-panel`

        // reset previous shown panels
        for (let p of panels) {
            p.style.zIndex = 1;
            p.style.opacity = 0;
        }
        // and display the selected panel
        let panel = document.getElementById(panelName);
        panel.style.zIndex = 2;
        panel.style.opacity = 1;
        
        // inform the server about which .out file should be parsed
        let res = await fetch(`plotType/${swc.id}`);
        // wait for the response, then active buttons for plotting
        if (res.ok) {
            let { info, id: btn_id_array } = await res.json();
            console.log(`server: ${info}`);


            // add buttons
            if (switchState[swc.id] === 'untouched') {
                switchState[swc.id] = 'touched';
            } else {
                return;
            }
            btn_id_array.forEach(type => {
                let subDiv = document.createElement('div')
                type.forEach(id => {
                    let btn = document.createElement('button');
                    btn.setAttribute('id', `${swc.id}-${id}`);
                    btn.setAttribute('class', 'tab-l1-btn');
                    btn.innerText = id;
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
}

function registerButtons() {
    let buttons = document.getElementsByClassName('tab-l1-btn');
    for (let btn of buttons) {
        btn.onclick = async function () {

            let figObj = await fetch(`data/${btn.id}`);
            let figures = await figObj.json();

            // field mode figures need some local calculation
            // TODO: reduce size of some callbacks by moving this condition out
            if (btn.id.includes('_mode')) {
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
            }

            // invoke Plotly
            for (let i = 0; i < figures.length; i++) {
                Plotly.newPlot(`figure-${i + 1}`, figures[i].data, figures[i].layout);
            }
        }
    }
}
