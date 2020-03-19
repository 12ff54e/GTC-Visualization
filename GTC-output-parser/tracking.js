const PlotType = require('./PlotType.js');
const PlotlyData = require('./PlotlyData.js');
const fs = require('fs').promises;
const path = require('path');
const Spline = require('./spline.js');
const { flat } = require('./util.js')

class Tracking extends PlotType {
    /**
     * @param {{path: string, iterArray: Array<Iterator<string>>}} data 
     * @param {object} basicParams GTCOutput.parameters
     */
    constructor(data, basicParams) {
        super(data);
        this.steps = new Array();
        this.plotTypes = [['random_pick']];

        const { psiw, ndiag, mstep } = basicParams;
        this.psiw = psiw;

        process.stdout.write('reading tracking files:        ');
        stepLoop:
        do {
            // concat particle coordinate of one step from all files
            let allParticles = new Array();
            let thisStep;
            for (let iter of data.iterArray) {
                let { particleArray, step, done } = readOneStep(iter)
                if (done) break stepLoop;
                allParticles.push(...particleArray);
                thisStep = step;
            }
            this.steps.push(thisStep);
            process.stdout.write(`\b\b\b\b\b\b\b${(100 * thisStep / mstep).toFixed(2).padStart(6, ' ')}%`);

            // create container at first step
            if (!this.particleData) {
                this.particleData = Array.from({ length: allParticles.length }, _ => []);
            }
            // sort tags to guarantee each sub-array of this.particleData
            //  stores the same particle
            allParticles
                .sort(({ tag: a }, { tag: b }) => compareTag(a, b))
                .forEach((p, i) => {
                    this.particleData[i].push(p.coordinate);
                })

        } while (true)
        process.stdout.write('\nDone.\n');

        this.isCompleted = this.steps[this.steps.length - 1] + ndiag > mstep;
        this.expectedStepNumber = Math.floor(mstep / ndiag);
        this.stepNumber = this.steps.length;
    }

    /**
     * 
     * @param {string} dir
     */
    static async readDataFile(dir, basicParams) {
        let tracks = new Array();
        for (let file of await fs.readdir(dir)) {
            if (file.startsWith('TRACKP')) {
                const fileContent = await fs.readFile(path.join(dir, file), 'utf-8');
                tracks.push(fileContent.split('\n')[Symbol.iterator]());
            }
        }

        return new Tracking({
            path: dir,
            iterArray: tracks
        }, basicParams);
    }

    plotData(id, eqData) {
        const figureContainer = Array.from({ length: 1 }, _ => new PlotlyData())
        if (id === 'random_pick') {
            const psiMesh = flat(Array(eqData.poloidalGridPtNum)
                .fill([...Array(eqData.radialGridPtNum2).keys()]
                    .map(r => this.psiw * r / (eqData.radialGridPtNum2 - 1))));
            const thetaMesh = flat([...Array(eqData.poloidalGridPtNum).keys()]
                .map(i => Array(eqData.radialGridPtNum2)
                    .fill(2 * Math.PI * i / (eqData.poloidalGridPtNum - 1))));
            figureContainer[0].data.push({
                a: psiMesh,
                b: thetaMesh,
                x: flat(eqData.poloidalPlaneData['x']),
                y: flat(eqData.poloidalPlaneData['z']),
                type: 'carpet'
            });
            figureContainer[0].hideCarpetGridTicks();

            const idx = Math.floor(Math.random() * this.particleData.length);
            figureContainer[0].data.push({
                a: this.particleData[idx].map(coord => coord[0]),
                b: this.particleData[idx].map(coord => coord[1]),
                type: 'scattercarpet',
                line: {
                    shape: 'spline',
                    smoothing: 1
                }
            });
            figureContainer[0].axisEqual();
            figureContainer[0].plotLabel = 'Poloidal Plane';

            // figureContainer[1].data = [{
            //     x: cylindricalCoord[0].map((r, i) => r * Math.cos(cylindricalCoord[2][i])),
            //     y: cylindricalCoord[0].map((r, i) => r * Math.sin(cylindricalCoord[2][i])),
            //     z: cylindricalCoord[1],
            //     type: 'scatter3d',
            //     mode: 'markers',
            //     marker: {
            //         size: 1,
            //         color: 'rgb(240, 20, 20)'
            //     }
            // }]
            // figureContainer[1].plotLabel = '3D';

            // const updatemenus = [{
            //     buttons: [{
            //         args: ['mode', 'markers'],
            //         label: 'Disjoined',
            //         method: 'restyle'
            //     }, {
            //         args: ['mode', 'lines+markers'],
            //         label: 'Joined',
            //         method: 'restyle'
            //     }],
            //     direction: 'left',
            //     pad: { 'r': 10, 't': 10 },
            //     showactive: true,
            //     type: 'buttons',
            //     x: 0.1,
            //     xanchor: 'left',
            //     y: 1.1,
            //     yanchor: 'top'
            // }];

            // figureContainer[1].layout.updatemenus = updatemenus;

        }
        return figureContainer;
    }
}

module.exports = Tracking;

/**
 * 
 * @param {Iterator<string>} iter 
 * 
 * @returns {Array<{coordinate: Array<Number>, tag: Array<Number>}>} a particle array
 */
function readOneStep(iter) {
    let { value, done } = iter.next();
    if (done || !value) {
        return { done: true };
    }

    let step = parseInt(value);
    let particleNum = parseInt(iter.next().value);
    let particleArray = new Array();

    for (let i = 0; i < particleNum; i++) {
        let line1 = iter.next().value.trim().split(/\s+/);
        let line2 = iter.next().value.trim().split(/\s+/);
        particleArray.push({
            coordinate: line1.slice(0, 3).map(x => parseFloat(x)),
            tag: line2.slice(-2).map(x => parseFloat(x))
        })
    }

    return {
        particleArray: particleArray,
        step: step,
    };
}

/**
 * compare tags to determine order, tag is ordered number pair
 * @param {Array<number>} a 
 * @param {Array<number>} b 
 */
function compareTag(a, b) {
    let [ah, al] = a;
    let [bh, bl] = b;

    return ah === bh ? al - bl : ah - bh;
}