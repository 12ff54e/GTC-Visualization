const PlotlyData = require('./PlotlyData.js');
const PlotType = require('./PlotType.js');
const { range } = require('./util.js');

const particlePlotTypes =
    ['density', 'momentum', 'energy', 'pm_flux', 'e_flux'];
const fieldTypes = ['phi', 'a_para', 'fluid_ne'];

/**
 * History class containing all data from history.out
 * 
 */
class History extends PlotType {
    /**
     * 
     * @param {{path: string, iter: Iterator<string>}} data 
     * @param {object} basicParams GTCOutput.parameters
     */
    constructor(data, basicParams) {
        super(data, basicParams);
        let iter = data.iter;

        // raw parameters
        this.stepNumber = parseInt(iter.next().value);
        this.speciesNumber = parseInt(iter.next().value);
        this.particleDiagnosticNumber = parseInt(iter.next().value);
        this.fieldNumber = parseInt(iter.next().value);
        this.fieldModeNumber = parseInt(iter.next().value);
        this.fieldDiagnosticNumber = parseInt(iter.next().value);
        this.timeStep = parseFloat(iter.next().value);

        this.plotTypes = [
            ...fieldTypes.map(f =>
                [f, f + '-RMS', ...range(1, 9).map(i => `${f}-mode${i}`)]),
            ...this.existingParticles.map(t => particlePlotTypes.map(p => t + '-' + p)),
        ];

        // pre-allocate data containers
        // particle data has dimension of (speciesNumber, particleDiagnosticNumber, stepNumber)
        // field time series data has dimension of (fieldNumber, fieldDiagnosticNumber, stepNumber)
        // field mode data has dimension of (fieldNumber, fieldModeNumber, 2, stepNumber)
        this.particleData = new Object();
        this.fieldTimeSeriesData = new Object();
        this.fieldModeData = new Object();

        // read particle and field data from historyData
        for (let step = 0; step < this.stepNumber; step++) {
            // particle data
            for (let particle of this.existingParticles) {
                if (step == 0) {
                    this.particleData[particle] =
                        Array.from({ length: this.particleDiagnosticNumber }, _ => []);
                }
                for (let i = 0; i < this.particleDiagnosticNumber; i++) {
                    this.particleData[particle][i].push(parseFloat(iter.next().value))
                }
            }

            // field time series data
            for (let field of fieldTypes) {
                if (step == 0) {
                    this.fieldTimeSeriesData[field] =
                        Array.from({ length: this.fieldDiagnosticNumber }, _ => [])
                    this.fieldModeData[field] =
                        Array.from({ length: this.fieldModeNumber }, _ => {
                            return {
                                real: [],
                                imag: []
                            }
                        })
                }
                for (let i = 0; i < this.fieldDiagnosticNumber; i++) {
                    this.fieldTimeSeriesData[field][i].push(parseFloat(iter.next().value));
                }
            }

            // field mode data
            for (let field of fieldTypes) {
                for (let i = 0; i < this.fieldModeNumber; i++) {
                    this.fieldModeData[field][i].real.push(parseFloat(iter.next().value));
                    this.fieldModeData[field][i].imag.push(parseFloat(iter.next().value));
                }
            }

        }
        PlotType.checkEnd(data);
    }


    /**
     * Slice history data and return it encapsulated in an array.
     *  Each element of the array is an object with data plot options,
     *  as per specifications of Plotly library.
     * 
     * @param {String} id the figure(s) being requested
     * @param {Object} basicParams GTCOutput.parameters
     */
    plotData(id, basicParams) {
        let [cat, type] = id.split('-');
        type = type ? type : 'point';
        let figureContainer = new Array();
        let timeStep = basicParams.ndiag * basicParams.tstep;

        if (fieldTypes.includes(cat)) {
            // field
            if (!type.includes('mode')) {
                // point value
                let plotType = type === 'point' ? 0 : 2;
                for (let i = 0; i < 2; i++) {
                    let figure = new PlotlyData();
                    figure.data.push({
                        y: this.fieldTimeSeriesData[cat][i + plotType],
                        mode: 'lines',
                    });
                    figure.addX(timeStep);
                    figure.plotLabel = type === 'point'
                        ? (i == 0
                            ? `${cat} (theta=zeta=0)`
                            : `${cat}00 (iflux@diag)`)
                        : (`${i == 0 ? 'ZF' : cat} RMS`)
                    figure.axesLabel = {
                        x: 'R_0/c_s',
                        y: ''
                    };
                    figureContainer.push(figure);
                }

            } else {
                // mode value
                let modeIndex = parseInt(type.replace('mode', '')) - 1;
                let figure = new PlotlyData();
                let fieldMode = this.fieldModeData[cat][modeIndex];
                // real and imaginary components
                figure.data.push({ y: fieldMode.real, mode: 'lines', name: 'real' });
                figure.data.push({ y: fieldMode.imag, mode: 'lines', name: 'imaginary' });
                figure.addX(timeStep);
                figure.plotLabel =
                    `n=${basicParams.nmodes[modeIndex]}, m=${basicParams.mmodes[modeIndex]}`;
                figure.axesLabel = { x: 'R_0/c_s', y: '' };
                figureContainer.push(figure);

                // growth rate
                figure = new PlotlyData();
                figure.data.push({
                    y: fieldMode.real.map((re, ind) => {
                        let im = fieldMode.imag[ind]
                        return Math.sqrt(re * re + im * im);
                    }),
                    mode: 'lines'
                });
                figure.addX(timeStep);
                figure.axesLabel = { x: 'R_0/c_s', y: '' };
                figure.layout.yaxis.type = 'log';
                figure.layout.showlegend = false;
                figureContainer.push(figure);

                // frequency
                figure = new PlotlyData();
                figure.axesLabel = { x: 'R_0/c_s', y: '' };
                figure.layout.showlegend = false;
                figureContainer.push(figure);

                // fft
                figure = new PlotlyData();
                figure.axesLabel = { x: 'mode number', y: '' };
                figure.plotLabel = 'power spectral';
                figureContainer.push(figure);
            }
        } else {
            // particle
            // Each plot type has two sub-figure
            let plotType = particlePlotTypes.indexOf(type);
            for (let i = 0; i < 2; i++) {
                let figure = new PlotlyData();
                figure.data.push({
                    y: this.particleData[cat][i + 2 * plotType]
                });
                figure.addX(timeStep);
                figure.axesLabel = { x: 'R_0/c_s', y: '' };
                switch (plotType) {
                    case 0: figure.plotLabel = i == 0 ? 'delta-f' : 'delta-f^2'; break;
                    case 1: figure.plotLabel = i == 0 ? 'parallel flow u' : 'delta u'; break;
                    case 2: figure.plotLabel = i == 0 ? 'energy' : 'delta-e'; break;
                    case 3: figure.plotLabel = i == 0 ? 'particle flow' : 'momentum flow'; break;
                    case 4: figure.plotLabel = i == 0 ? 'energy flow' : 'total density';
                };
                figureContainer.push(figure);
            }
        }

        return figureContainer;
    }
}

module.exports = History;
