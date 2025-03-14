const PlotlyData = require('./PlotlyData.js');
const PlotType = require('./PlotType.js');

const particlePlotTypes = [
    'density',
    'flow',
    'energy',
    'PDF_energy',
    'PDF_pitch',
];
const fieldPlotTypes = ['flux', 'spectrum', 'poloidal', 'psi', 'theta'];

/**
 * Snapshot class containing all data from snap*******.out
 */
class Snapshot extends PlotType {
    /**
     * @param {string} filePath
     * @param {Object} basicParams GTCOutput.parameters
     */
    constructor(filePath, basicParams) {
        super(filePath, basicParams);
        this.isTimeSeriesData = false;

        this.plotTypes = [
            ...PlotType.fieldID.map(f => fieldPlotTypes.map(p => f + '-' + p)),
            ...this.existingParticles.map(t =>
                particlePlotTypes.map(p => t + '-' + p)
            ),
        ];

        // particle data, including profile of torques and pdf of energy and pitch angle
        this.particleData = new Object();

        // field data, including poloidal plane and flux
        this.fieldData = new Object();
    }

    *parseLine() {
        this.speciesNumber = parseInt(yield);
        this.fieldNumber = parseInt(yield);
        this.velocityGridNumber = parseInt(yield);
        this.radialGridPtNumber = parseInt(yield);
        this.poloidalGridPtNumber = parseInt(yield) - 1;
        this.toroidalGridPtNumber = parseInt(yield);
        this.maxEnergy = parseFloat(yield);

        this.deal_with_particle_species(particlePlotTypes);

        // read data
        for (let particle of this.existingParticles) {
            this.particleData[particle] = new Object();
            for (let type = 0; type < 3; type++) {
                const pt = (this.particleData[particle][
                    particlePlotTypes[type]
                ] = Array.from({ length: 2 }, _ => []));
                for (let i = 0; i < pt.length; i++) {
                    for (let r = 0; r < this.radialGridPtNumber; r++) {
                        pt[i].push(parseFloat(yield));
                    }
                }
            }
        }

        for (let particle of this.existingParticles) {
            for (let type = 3; type < 5; type++) {
                const pt = (this.particleData[particle][
                    particlePlotTypes[type]
                ] = Array.from({ length: 2 }, _ => []));
                for (let i = 0; i < pt.length; i++) {
                    for (let v = 0; v < this.velocityGridNumber; v++) {
                        pt[i].push(parseFloat(yield));
                    }
                }
            }
        }

        this.fieldData['poloidalPlane'] = new Object();
        for (let field of PlotType.fieldID.concat(['x', 'y'])) {
            let tmp = (this.fieldData['poloidalPlane'][field] = []);
            for (let r = 0; r < this.radialGridPtNumber; ++r) {
                for (let p = 0; p <= this.poloidalGridPtNumber; ++p)
                    tmp.push(parseFloat(yield));
            }
        }

        this.fieldData['fluxData'] = new Object();
        for (let field of PlotType.fieldID) {
            let tmp = (this.fieldData['fluxData'][field] = Array.from(
                { length: this.toroidalGridPtNumber },
                _ => []
            ));
            for (let t = 0; t < this.toroidalGridPtNumber; t++) {
                for (let p = 0; p < this.poloidalGridPtNumber + 1; p++) {
                    tmp[t].push(parseFloat(yield));
                }
            }
        }
    }

    /**
     * Generate plot data as per specifications of Plotly library.
     *
     * @param {string} id
     *
     * @returns {Array<PlotlyData>}
     */
    plotData(id) {
        // cat is the category of the plot, could be particle name or field name
        // type is the type of the plot, one of strings in particlePlotType or fieldPlotType
        let [cat, type] = id.split('-');
        let figureContainer = new Array();
        let fig = new PlotlyData();

        if (PlotType.fieldID.includes(cat)) {
            // field
            let index = fieldPlotTypes.indexOf(type);
            switch (index) {
                case 0: // field strength on flux surface
                    fig.data.push({
                        z: this.fieldData['fluxData'][cat],
                        type: 'heatmap',
                        colorbar: {
                            tickformat: '.4g',
                        },
                        transpose: true,
                    });
                    fig.axesLabel = { x: 'nzeta', y: 'mtheta' };
                    fig.plotLabel = `$${PlotType.fieldDisplayName[cat]}\\text{ on flux surface}$`;
                    figureContainer.push(fig);
                    break;
                case 1: // poloidal and parallel spectrum
                    // This figure involves some interaction, so data will be generate on client side
                    let figs = Array.from({ length: 2 }, _ => new PlotlyData());
                    figs.forEach((fig, i) => {
                        fig.data.push({
                            type: 'scatter',
                            mode: 'lines',
                        });
                        fig.plotLabel = `$\\text{${
                            i == 0 ? 'poloidal' : 'parallel'
                        } spectrum}$`;
                    });
                    figs.push({ extraData: this.fieldData['fluxData'][cat] });
                    figureContainer = figs;
                    break;
                case 2: // field strength on poloidal plane
                    let polData = this.fieldData['poloidalPlane'];
                    // add carpet
                    const carpet = {
                        x: polData['x'],
                        y: polData['y'],
                        type: 'carpet',
                    };
                    // add contour
                    const field_contour = {
                        z: polData[cat],
                        type: 'contourcarpet',
                        contours: {
                            showlines: false,
                        },
                        colorbar: {
                            tickformat: '.4g',
                            y: 0,
                            yanchor: 'bottom',
                            len: 0.85,
                        },
                    };
                    fig.data.push(carpet, field_contour);
                    fig.axisEqual();
                    fig.hideCarpetGrid();
                    fig.axesLabel = { x: '$\\text{R}$', y: '$\\text{Z}$' };
                    fig.plotLabel = `$${PlotType.fieldDisplayName[cat]}\\text{ on poloidal plane}$`;
                    fig.layout.height = 700;
                    figureContainer.push(fig);

                    let fig2 = new PlotlyData();
                    fig2.axesLabel = { x: '$\\text{mpsi}$', y: '' };
                    fig2.plotLabel = `$${PlotType.fieldDisplayName[cat]}\\text{ mode profile}$`;
                    figureContainer.push(fig2);
                    figureContainer.push({
                        polNum: this.poloidalGridPtNumber,
                        radNum: this.radialGridPtNumber,
                    });
                    break;
                case 3:
                case 4: // profile of field and rms
                    let field = this.fieldData['poloidalPlane'][cat];
                    // point value
                    let fig0 = new PlotlyData();
                    let pv = [];
                    if (type === 'psi') {
                        for (let r = 0; r < this.radialGridPtNumber; ++r) {
                            pv.push(field[r * (this.poloidalGridPtNumber + 1)]);
                        }
                    } else {
                        const start =
                            Math.floor((this.radialGridPtNumber - 1) / 2) *
                            (this.poloidalGridPtNumber + 1);
                        pv = field.slice(
                            start,
                            start + this.poloidalGridPtNumber + 1
                        );
                    }
                    fig0.data.push({
                        y: pv,
                        type: 'scatter',
                        mode: 'lines',
                    });
                    fig0.addX(1, 0);
                    fig0.axesLabel = {
                        x: `$\\text{${type === 'psi' ? 'mpsi' : 'mtheta'}}$`,
                        y: '',
                    };
                    fig0.plotLabel = '$\\text{Point value}$';
                    figureContainer.push(fig0);

                    // RMS
                    let fig1 = new PlotlyData();

                    const rms =
                        type === 'psi'
                            ? field
                                  .reduce((acc, curr, idx) => {
                                      if (
                                          idx %
                                              (this.poloidalGridPtNumber + 1) ==
                                          0
                                      ) {
                                          acc.push(curr * curr);
                                      } else {
                                          acc[acc.length - 1] += curr * curr;
                                      }
                                      return acc;
                                  }, [])
                                  .map(v =>
                                      Math.sqrt(v / this.poloidalGridPtNumber)
                                  )
                            : field
                                  .reduce((acc, curr, idx) => {
                                      acc[
                                          idx % (this.poloidalGridPtNumber + 1)
                                      ] += curr * curr;
                                      return acc;
                                  }, Array(this.poloidalGridPtNumber + 1).fill(0))
                                  .map(v =>
                                      Math.sqrt(
                                          v / (this.radialGridPtNumber - 1)
                                      )
                                  );
                    fig1.data.push({
                        y: rms,
                        type: 'scatter',
                        mode: 'lines',
                    });
                    fig1.addX(1, 0);
                    fig1.axesLabel = {
                        x: `$\\text{${type === 'psi' ? 'mpsi' : 'mtheta'}}$`,
                        y: '',
                    };
                    fig1.plotLabel = '$\\text{RMS}$';
                    figureContainer.push(fig1);
                    break;
            }
        } else if (this.existingParticles.includes(cat)) {
            // particle
            let figs = Array.from({ length: 2 }, _ => new PlotlyData());
            figs.forEach((fig, i) => {
                fig.data.push({
                    y: this.particleData[cat][type][i],
                    type: 'scatter',
                    mode: 'lines',
                });
                fig.addX(1, 0);
                fig.axesLabel = {
                    x: type.startsWith('PDF') ? '' : '$\\text{mpsi}$',
                    y: '',
                };
                fig.plotLabel =
                    `$${i == 0 ? '\\text{full }f' : '\\delta f'}` +
                    `\\text{ ${type.replace('_', ' of ')}}$`;
            });
            figureContainer = figs;
        } else {
            throw new Error('Incorrect figure type');
        }

        return figureContainer;
    }
}

module.exports = Snapshot;
