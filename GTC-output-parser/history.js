const fs = require('fs').promises;
const path = require('path');
const PlotlyData = require('./PlotlyData.js')

const particlePlotType =
    ['density', 'momentum', 'energy', 'pm_flux', 'e_flux'];
const plotType = [
    ['phi', 'phi_RMS', ...range(1, 9).map(i => `phi_mode${i}`)],
    ['a_para', 'a_para_RMS', ...range(1, 9).map(i => `a_para_mode${i}`)],
    ['fluid_ne', 'fluid_ne_RMS', ...range(1, 9).map(i => `fluid_ne_mode${i}`)],
    ...['ion_', 'EP_', 'electron_'].map(t => particlePlotType.map(p => t + p)),
];

/**
 * History class containing all data from history.out
 * 
 */
class History {
    constructor(historyData) {

        if (!Array.isArray(historyData) || historyData.path === undefined) {
            throw new Error('The constructor of History cannot be called directly.');
        }

        this.path = historyData.path;
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
        this.frequencyNumber = Math.round((this.stepEnd - this.stepStart) / 2);

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
                // begin index of field mode data
                let beginIndex2 = beginIndex1 + this.fieldDiagnosticNumber;
                this.fieldTimeSeriesData[step][field] = historyData
                    .slice(beginIndex1, beginIndex2)
                    .map(str => parseFloat(str));
                let tmp = historyData
                    .slice(beginIndex2, beginIndex2 + 2 * this.fieldModeNumber)
                    .map(str => parseFloat(str));
                this.fieldModeData[step][field] = list2Complex(tmp);
            }
        }

        console.log(`${this.path} read`);

    }

    static async readHistoryFile(dir) {

        let histDir = path.join(dir, 'history.out');
        let historyDataString = await fs.readFile(histDir, 'utf-8');
        let historyData = historyDataString.split('\n');

        historyData.path = histDir;

        return new History(historyData);
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
        let id = plotType.flat().findIndex(t => type === t);
        let obj;
        let len = this.stepEnd - this.stepStart;

        switch (id) {
            case 0:
                obj = Array.from({ length: 2 }, _ => new PlotlyData());
                for (let i = 0; i < 2; i++) {
                    obj[i].data.push({
                        y: part(this.fieldTimeSeriesData,
                            [[this.stepStart, this.stepEnd], 0, i]),
                        mode: 'lines'
                    });
                    obj[i].addX();
                    obj[i].axesLabel = {
                        x: 'Time Step',
                        y: `${i == 0 ? 'phi' : 'phip'} (theta=zeta=0)`
                    };
                }
                break;
            case 1:
                obj = Array.from({ length: 2 }, _ => new PlotlyData());
                for (let i = 0; i < 2; i++) {
                    obj[i].data.push({
                        y: part(this.fieldTimeSeriesData,
                            [[this.stepStart, this.stepEnd], 0, i + 2]),
                        mode: 'lines'
                    });
                    obj[i].addX();
                    obj[i].axesLabel = {
                        x: 'Time Step',
                        y: `${i == 0 ? 'phip' : 'phi'} RMS (theta=zeta=0)`
                    };
                }
                break;
            case 2:
                break;
            case 3:
                break;
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

/**
 * This function return an integer sequence 
 *  range(n) => [0 .. n-1], or
 *  range(m, n) => [m .. n-1]
 * 
 * @param {Number} initOrLen when this function is given one parameter,
 *  this parameter will be array length
 * @param {Number} end 
 */
function range(initOrLen, end) {
    if (end === undefined) {
        return [...Array(initOrLen).keys()];
    } else {
        return [...Array(end - initOrLen).keys()].map(i => i + initOrLen);
    }
}

/**
 * Home-made flat method
 * 
 * @returns {Array} the flattened array
 */
Array.prototype.flat = function () {
    return this.reduce((acc, curr) => {
        if (Array.isArray(curr)) {
            return [...acc, ...curr.flat()];
        } else {
            return [...acc, curr];
        }
    }, []);
}

/**
 * Multi Dimension slice of array, similar to that in Mathematica.
 *  Recursive implementation.
 * 
 * @param {Array} arr the array to be sliced
 * @param {Array} ijk Specifies part of each dimension to be extracted,
 *  could be integers, tuple of Integers or 'All', with negative number
 *  indicating counting from the end. When a tuple of integers are specified,
 *  it acts like Array.prototype.slice() at that level of depth.
 */
function part(arr, ijk) {
    let index = ijk.shift();
    if (index === undefined) {
        // recursion terminated
        return arr;
    } else if (typeof index === 'number') {
        // index
        return part(arr[index >= 0 ? index : arr.length + index], ijk.slice());
    } else if (Array.isArray(index)) {
        // range
        index = index.map(i => i >= 0 ? i : (i + arr.length));
        if (index.length !== 2 || index[0] >= index[1]) {
            throw new Error('Invalid range');
        }
        return arr.slice(...index).map(sub => part(sub, ijk.slice()));
    } else if (index === 'All') {
        // keep all entries
        return arr.map(e => part(e, ijk.slice()));
    }
}
