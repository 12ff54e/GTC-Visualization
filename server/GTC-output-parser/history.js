const PlotlyData = require('./PlotlyData.js');
const PlotType = require('./PlotType.js');
const { range, add_to_subscript } = require('./util.js');

const particlePlotTypes = [
    'density',
    'momentum',
    'energy',
    'pm_flux',
    'e_flux',
];

/**
 * History class containing all data from history.out
 *
 */
class History extends PlotType {
    /**
     *
     * @param {string} filePath
     * @param {object} basicParams GTCOutput.parameters
     */
    constructor(filePath, basicParams) {
        super(filePath, basicParams);
        this.isTimeSeriesData = true;

        this.fieldTypes = PlotType.fieldID;
        this.plotTypes = [
            ...this.servingFields.map(f => [
                f,
                f + '-RMS',
                ...range(1, 9).map(i => `${f}-mode${i}`),
            ]),
            ...this.existingParticles.map(t =>
                particlePlotTypes.map(p => t + '-' + p)
            ),
        ];

        // pre-allocate data containers
        // particle data has dimension of (speciesNumber, particleDiagnosticNumber, stepNumber)
        // field time series data has dimension of (fieldNumber, fieldDiagnosticNumber, stepNumber)
        // field mode data has dimension of (fieldNumber, fieldModeNumber, 2, stepNumber)
        this.particleData = new Object();
        this.fieldTimeSeriesData = new Object();
        this.fieldModeData = new Object();
    }

    *parseLine() {
        // basic parameters
        this.expectedStepNumber = parseInt(yield);
        this.speciesNumber = parseInt(yield);
        this.particleDiagnosticNumber = parseInt(yield);
        this.fieldNumber = parseInt(yield);
        this.fieldModeNumber = parseInt(yield);
        this.fieldDiagnosticNumber = parseInt(yield);
        this.timeStep = parseFloat(yield);
        this.initBlockSize = 7;
        this.entryPerStep =
            this.speciesNumber * this.particleDiagnosticNumber +
            this.fieldNumber *
                (this.fieldDiagnosticNumber + 2 * this.fieldModeNumber);

        this.deal_with_particle_species(particlePlotTypes);

        // Initialize
        this.existingParticles.forEach(particle => {
            this.particleData[particle] = Array.from(
                { length: this.particleDiagnosticNumber },
                _ => []
            );
        });
        this.fieldTypes.forEach(field => {
            this.fieldTimeSeriesData[field] = Array.from(
                { length: this.fieldDiagnosticNumber },
                _ => []
            );
            this.fieldModeData[field] = Array.from(
                { length: this.fieldModeNumber },
                _ => {
                    return {
                        real: [],
                        imag: [],
                    };
                }
            );
        });

        while (true) {
            for (let particle of this.existingParticles) {
                for (let i = 0; i < this.particleDiagnosticNumber; i++) {
                    this.particleData[particle][i].push(parseFloat(yield));
                }
            }
            for (let field of this.fieldTypes) {
                for (let i = 0; i < this.fieldDiagnosticNumber; i++) {
                    this.fieldTimeSeriesData[field][i].push(parseFloat(yield));
                }
            }
            for (let field of this.fieldTypes) {
                for (let i = 0; i < this.fieldModeNumber; i++) {
                    this.fieldModeData[field][i].real.push(parseFloat(yield));
                    this.fieldModeData[field][i].imag.push(parseFloat(yield));
                }
            }
        }
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
        const tu = '$R_0/c_s$';

        if (PlotType.fieldID.includes(cat)) {
            // field
            if (!type.includes('mode')) {
                // point value
                let plot_type_index = type === 'point' ? 0 : 2;
                for (let i = 0; i < 2; i++) {
                    let figure = new PlotlyData();
                    figure.data.push({
                        y: this.fieldTimeSeriesData[cat][
                            i + plot_type_index
                        ].slice(0, this.stepNumber),
                        mode: 'lines',
                    });
                    figure.addX(timeStep);
                    figure.plotLabel =
                        type === 'point'
                            ? i == 0
                                ? `$${PlotType.fieldDisplayName[cat]} (\\theta=\\zeta=0)$`
                                : `$${add_to_subscript(
                                      PlotType.fieldDisplayName[cat],
                                      '00'
                                  )} (\\text{iflux@diag})$`
                            : `$${
                                  i == 0
                                      ? '\\text{ZF}'
                                      : PlotType.fieldDisplayName[cat]
                              }\\text{ RMS}$`;
                    figure.axesLabel = {
                        x: tu,
                        y: '',
                    };
                    figureContainer.push(figure);

                    if (plot_type_index == 2) {
                        // add log plot of RMS
                        let figure = new PlotlyData();
                        figure.data.push({
                            y: this.fieldTimeSeriesData[cat][
                                i + plot_type_index
                            ]
                                .slice(0, this.stepNumber)
                                .map(val => Math.log(val)),
                            mode: 'lines',
                        });
                        figure.addX(timeStep);
                        figure.plotLabel = `$${
                            i == 0
                                ? '\\text{ZF}'
                                : PlotType.fieldDisplayName[cat]
                        }\\text{ RMS}\\ (\\log)$`;
                        figure.axesLabel = {
                            x: tu,
                            y: '',
                        };
                        figureContainer.push(figure);
                    }
                }
            } else {
                // mode value
                let modeIndex = parseInt(type.replace('mode', '')) - 1;
                let figure = new PlotlyData();
                let fieldMode = this.fieldModeData[cat][modeIndex];
                // real and imaginary components
                figure.data.push({
                    y: fieldMode.real.slice(0, this.stepNumber),
                    mode: 'lines',
                    name: 'real',
                });
                figure.data.push({
                    y: fieldMode.imag.slice(0, this.stepNumber),
                    mode: 'lines',
                    name: 'imaginary',
                });
                figure.addX(timeStep);
                figure.plotLabel = `$n=${basicParams.nmodes[modeIndex]},\\;m=${basicParams.mmodes[modeIndex]}$`;
                figure.axesLabel = { x: tu, y: '' };
                figureContainer.push(figure);

                // growth rate
                figure = new PlotlyData();
                figure.data.push({
                    y: fieldMode.real
                        .slice(0, this.stepNumber)
                        .map((re, ind) => {
                            let im = fieldMode.imag[ind];
                            return Math.sqrt(re * re + im * im);
                        }),
                    mode: 'lines',
                });
                figure.addX(timeStep);
                figure.axesLabel = { x: tu, y: '' };
                figure.layout.yaxis.type = 'log';
                figure.layout.showlegend = false;
                figureContainer.push(figure);

                // frequency
                figure = new PlotlyData();
                figure.axesLabel = { x: tu, y: '' };
                figure.layout.showlegend = false;
                figureContainer.push(figure);

                // fft
                figure = new PlotlyData();
                figure.axesLabel = { x: '$\\text{mode number}$', y: '' };
                figure.plotLabel = '$\\text{Power spectral}$';
                figureContainer.push(figure);
            }
        } else {
            // particle
            // Each plot type has two sub-figure
            let plotType = particlePlotTypes.indexOf(type);
            for (let i = 0; i < 2; i++) {
                let figure = new PlotlyData();
                figure.data.push({
                    y: this.particleData[cat][i + 2 * plotType].slice(
                        0,
                        this.stepNumber
                    ),
                });
                figure.addX(timeStep);
                figure.axesLabel = { x: tu, y: '' };
                switch (plotType) {
                    case 0:
                        figure.plotLabel =
                            i == 0 ? '$\\delta f$' : '$\\delta f^2$';
                        break;
                    case 1:
                        figure.plotLabel =
                            i == 0
                                ? '$u_{\\parallel}$'
                                : '$\\delta u_{\\parallel}$';
                        break;
                    case 2:
                        figure.plotLabel =
                            i == 0 ? '$\\text{Energy}$' : '$\\delta E$';
                        break;
                    case 3:
                        figure.plotLabel =
                            i == 0
                                ? '$\\text{Particle flow}$'
                                : '$\\text{Momentum flow}$';
                        break;
                    case 4:
                        figure.plotLabel =
                            i == 0
                                ? '$\\text{Energy flow}$'
                                : `$\\text{${
                                      this.particleDiagnosticNumber == 10
                                          ? 'Total density'
                                          : 'Runaway Fraction'
                                  }}$`;
                }
                figureContainer.push(figure);
            }
        }

        return figureContainer;
    }
}

module.exports = History;
