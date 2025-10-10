const PlotType = require('./PlotType.js');
const PlotlyData = require('./PlotlyData.js');

const particle_plot_types = ['particle_flux', 'energy_flux', 'momentum_flux'];
const field_plot_types = ['zonal', 'rms'];

class RadialTime extends PlotType {
    /**
     *
     * @param {string} filePath
     */
    constructor(filePath, basicParams) {
        super(filePath, basicParams);
        this.isTimeSeriesData = true;

        this.plotTypes = [
            ...this.servingFields.map(t => ({
                index: PlotType.index_lookup(t),
                id: field_plot_types
                    .slice(0, this.fieldPlotTypeNumber)
                    .map(p => t + '-' + p),
            })),
            ...this.existingParticles.map(t => ({
                index: PlotType.index_lookup(t),
                id: particle_plot_types
                    .slice(0, this.particlePlotTypeNumber)
                    .map(p => t + '-' + p),
            })),
        ];
    }

    *parseLine() {
        this.expectedStepNumber = parseInt(yield);
        this.radialGridPtNumber = parseInt(yield);
        this.speciesNumber = parseInt(yield);
        yield;
        this.particlePlotTypeNumber = parseInt(yield);
        this.fieldNumber = parseInt(yield);
        this.fieldPlotTypeNumber = parseInt(yield);

        this.initBlockSize = 7;
        this.entryPerStep =
            this.radialGridPtNumber *
            (this.speciesNumber * this.particlePlotTypeNumber +
                this.fieldNumber * this.fieldPlotTypeNumber);

        this.deal_with_particle_species(particle_plot_types);

        // Initialize
        this.data = new Object();
        for (let particle of this.existingParticles) {
            this.data[particle] = new Object();
            for (let type of particle_plot_types) {
                this.data[particle][type] = new Array();
            }
        }
        for (let field of PlotType.field_ID) {
            this.data[field] = new Object();
            for (let type of field_plot_types) {
                this.data[field][type] = new Array();
            }
        }

        // read data
        while (true) {
            for (let particle of this.existingParticles) {
                for (let type of particle_plot_types) {
                    const rl = [];
                    this.data[particle][type].push(rl);
                    for (let r = 0; r < this.radialGridPtNumber; r++) {
                        rl.push(parseFloat(yield));
                    }
                }
            }
            for (let type of field_plot_types) {
                for (let field of PlotType.field_ID) {
                    const rl = [];
                    this.data[field][type].push(rl);
                    for (let r = 0; r < this.radialGridPtNumber; r++) {
                        rl.push(parseFloat(yield));
                    }
                }
            }
        }
    }

    /**
     *
     * @param {string} id
     */
    plotData(id) {
        let [cat, type] = id.split('-');

        let figure = new PlotlyData();

        figure.data.push({
            z: this.data[cat][type],
            type: 'heatmap',
            colorbar: {
                tickformat: '.4e',
            },
            transpose: true,
            zhoverformat: '.4g',
        });

        figure.axesLabel = { x: '$\\text{time step}$', y: '$\\text{mpsi}$' };
        figure.plotLabel =
            `$${
                PlotType.field_ID.includes(cat)
                    ? PlotType.fieldDisplayName[cat]
                    : `\\mathrm{${cat}}`
            }\\;` + `\\text{${type.replace('_', ' ')}}$`;

        return [figure];
    }
}

module.exports = RadialTime;