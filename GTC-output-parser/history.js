const fs = require('fs').promises;
const path = require('path');
const PlotlyData = require('./PlotlyData.js')
const util = require('./util.js');

const particleTypes = ['ion', 'electron', 'EP', 'fast_electron']
const particlePlotTypes =
    ['density', 'momentum', 'energy', 'pm_flux', 'e_flux'];
const fieldTypes = ['phi', 'a_para', 'fluid_ne'];
const plotTypes = [
    ...fieldTypes.map(f => [f, f + '_RMS', ...util.range(1, 9).map(i => `${f}_mode${i}`)]),
    ...particleTypes.map(t => particlePlotTypes.map(p => t + '_' + p)),
];

/**
 * History class containing all data from history.out
 * 
 */
class History {
    constructor(historyData, basicParams) {

        if (!Array.isArray(historyData) || historyData.path === undefined) {
            throw new Error('The constructor of History cannot be called directly.');
        }

        this.path = historyData.path; // file path


        // raw parameters
        this.speciesNumber = parseInt(historyData[1]);
        this.particleDiagnosticNumber = parseInt(historyData[2]);
        this.fieldNumber = parseInt(historyData[3]);
        this.fieldModeNumber = parseInt(historyData[4]);
        this.fieldDiagnosticNumber = parseInt(historyData[5]);
        this.timeStep = parseFloat(historyData[6]);

        // basic parameters
        let dataEntryPerStep = this.speciesNumber * this.particleDiagnosticNumber
            + this.fieldNumber * (2 * this.fieldModeNumber + this.fieldDiagnosticNumber);
        this.stepNumber = Math.floor(historyData.length / dataEntryPerStep);
        this.stepStart = 0;
        this.stepEnd = this.stepNumber;

        // find out the particle(s) in history.out
        let { iload, nhybrid, fload, feload } = basicParams;
        this.plotTypes = plotTypes.filter((_, i) =>
            i < this.fieldNumber || [iload, nhybrid, fload, feload][i - this.fieldNumber] > 0
        )

        // pre-allocate data containers
        // particle data has dimension of (stepNumber, speciesNumber, particleDiagnosticNumber)
        // field time series data has dimension of (stepNumber, fieldNumber, fieldDiagnosticNumber)
        // field mode data has dimension of (stepNumber, fieldNumber, fieldModeNumber)
        this.particleData = new Array(this.stepNumber);
        this.fieldTimeSeriesData = new Array(this.stepNumber);
        this.fieldModeData = new Array(this.stepNumber);

        // read particle and field data from historyData
        for (let step = 0; step < this.stepNumber; step++) {
            // particle data
            this.particleData[step] = new Array(this.speciesNumber);
            for (let species = 0; species < this.speciesNumber; species++) {
                let beginIndex = 7
                    + species * this.particleDiagnosticNumber
                    + step * dataEntryPerStep;
                this.particleData[step][species] = historyData
                    .slice(beginIndex, beginIndex + this.particleDiagnosticNumber)
                    .map(str => parseFloat(str));
            }

            // field time series data
            this.fieldTimeSeriesData[step] = new Array(this.fieldNumber);
            // field mode data
            this.fieldModeData[step] = new Array(this.fieldNumber);
            for (let field = 0; field < this.fieldNumber; field++) {
                // begin index of field time series data
                let beginIndex1 = 7
                    + this.speciesNumber * this.particleDiagnosticNumber
                    + field * this.fieldDiagnosticNumber
                    + step * dataEntryPerStep;
                this.fieldTimeSeriesData[step][field] = historyData
                    .slice(beginIndex1, beginIndex1 + this.fieldDiagnosticNumber)
                    .map(str => parseFloat(str));

                // begin index of field mode data
                let beginIndex2 = 7
                    + this.speciesNumber * this.particleDiagnosticNumber
                    + this.fieldNumber * this.fieldDiagnosticNumber
                    + field * 2 * this.fieldModeNumber
                    + step * dataEntryPerStep;
                let tmp = historyData
                    .slice(beginIndex2, beginIndex2 + 2 * this.fieldModeNumber)
                    .map(str => parseFloat(str));
                this.fieldModeData[step][field] = list2Complex(tmp);
            }
        }

        console.log(`${this.path} read`);

    }

    // TODO: iter over file content to save memory
    // This update should also applied to other sub classes
    static async readHistoryFile(dir, basicParams) {

        let histDir = path.join(dir, 'history.out');
        let historyDataString = await fs.readFile(histDir, 'utf-8');
        let historyData = historyDataString.split('\n');

        historyData.path = histDir;

        return new History(historyData, basicParams);
    }

    /**
     * Slice history data and return it encapsulated in an array.
     *  Each element of the array is an object with data plot options,
     *  as per specifications of Plotly library.
     * 
     * @param {String} type the figure(s) being requested
     * @param {Object} basicParams GTCOutput.parameters
     */
    plotData(type, basicParams) {
        let id = util.flat(this.plotTypes).findIndex(t => type === t);
        let obj;
        let len = this.stepEnd - this.stepStart;
        let timeStep = basicParams.ndiag * basicParams.tstep;

        if (id < 30) {
            let fieldType = Math.floor(id / 10);
            let plotType = id % 10;
            
            // field
            if (plotType < 2) {
                // point value
                obj = Array.from({ length: 2 }, _ => new PlotlyData());
                for (let i = 0; i < 2; i++) {
                    obj[i].data.push({
                        y: util.part(this.fieldTimeSeriesData,
                            [[this.stepStart, this.stepEnd], fieldType, i + 2 * plotType]),
                        mode: 'lines',
                    });
                    obj[i].addX(timeStep);
                    obj[i].plotLabel = plotType == 0
                        ? (i == 0
                            ? `${fieldTypes[fieldType]} (theta=zeta=0)`
                            : `${fieldTypes[fieldType]}00 (iflux@diag)`)
                        : (`${i == 0 ? 'ZF' : fieldTypes[fieldType]} RMS`)
                    obj[i].axesLabel = {
                        x: 'R_0/c_s',
                        y: ''
                    };
                }

            } else {
                // mode value
                let modeIndex = plotType - 2;
                obj = Array.from({ length: 4 }, _ => new PlotlyData());
                let fieldMode = util.part(this.fieldModeData,
                    [[this.stepStart, this.stepEnd], fieldType, modeIndex]);
                let { re, im } = fieldMode.reduce((acc, curr) => {
                    acc.re.push(curr.re);
                    acc.im.push(curr.im);
                    return acc;
                }, { re: new Array(), im: new Array() });
                // real and imaginary components
                obj[0].data.push({ y: re, mode: 'lines', name: 'real' });
                obj[0].data.push({ y: im, mode: 'lines', name: 'imaginary' });
                obj[0].addX(timeStep);
                obj[0].plotLabel =
                    `n=${basicParams.nmodes[modeIndex]}, m=${basicParams.mmodes[modeIndex]}`;
                obj[0].axesLabel = { x: 'R_0/c_s', y: '' }

                // growth rate
                obj[1].data.push({
                    y: fieldMode.map(({ re, im }) => Math.sqrt(re * re + im * im)),
                    mode: 'lines'
                });
                obj[1].addX(timeStep);
                obj[1].axesLabel = { x: 'R_0/c_s', y: '' };
                obj[1].layout.yaxis.type = 'log';
                obj[1].layout.showlegend = false;

                // frequency
                obj[2].axesLabel = { x: 'R_0/c_s', y: '' };
                obj[2].layout.showlegend = false;

                // fft
                obj[3].axesLabel = { x: 'mode number', y: '' };
                obj[3].plotLabel = 'power spectral';
            }
        } else {
            // particle
            let particleType = Math.floor((id - this.fieldNumber * (2 + this.fieldModeNumber)) / 5);
            let plotType = (id - this.fieldNumber * (2 + this.fieldModeNumber)) % 5;
            obj = Array.from({ length: 2 }, _ => new PlotlyData());
            for (let i = 0; i < 2; i++) {
                obj[i].data.push({
                    y: util.part(this.particleData,
                        [[this.stepStart, this.stepEnd], particleType, 2 * plotType + i])
                });
                obj[i].addX(timeStep);
                obj[i].axesLabel = { x: 'R_0/c_s', y: '' };
                switch (plotType) {
                    case 0: obj[i].plotLabel = i == 0 ? 'delta-f' : 'delta-f^2'; break;
                    case 1: obj[i].plotLabel = i == 0 ? 'parallel flow u' : 'delta u'; break;
                    case 2: obj[i].plotLabel = i == 0 ? 'energy' : 'delta-e'; break;
                    case 3: obj[i].plotLabel = i == 0 ? 'particle flow' : 'momentum flow'; break;
                    case 4: obj[i].plotLabel = i == 0 ? 'energy flow' : 'total density';
                };

            }
        }

        return obj;
    }
}

module.exports = History;

/**
 * This auxiliary function convert a list of real and imaginary
 * components to complex number object { re, im }.
 * 
 * e.g. [1,2,3,4] => [{ re:1, im:2 }, { re:3 ,im:4 }]
 * 
 * @param {Array<Number>} arr a list of real and imaginary parts
 * @returns {Array} array of complex numbers
 */
function list2Complex(arr) {
    if (arr.length % 2 !== 0) {
        return new Error("List Length mismatch!");
    }

    return arr.reduce((acc, curr, ci) => {
        if (ci % 2 === 0) {
            acc[ci / 2] = { re: curr };
        } else {
            acc[(ci - 1) / 2].im = curr;
        }
        return acc;
    }, new Array(arr.length / 2));
}
