const PlotType = require('./PlotType.js');
const PlotlyData = require('./PlotlyData.js');

const particlePlotTypes =
    ['particle_flux', 'energy_flux', 'momentum_flux'];
const fieldTypes = ['phi', 'a_para', 'fluid_ne'];
const fieldPlotTypes = ['zonal', 'rms'];

class RadialTime extends PlotType {
    /**
     * 
     * @param {{path: string, iter: Iterator<string>}} data 
     */
    constructor(data, basicParams) {
        super(data, basicParams);
        this.isTimeSeriesData = true;

        this.plotTypes = [
            ...this.existingParticles.map(t => particlePlotTypes
                .slice(0, this.particlePlotTypeNumber)
                .map(p => t + '-' + p)),
            ...fieldTypes.map(f => fieldPlotTypes
                .slice(0, this.fieldPlotTypeNumber)
                .map(p => f + '-' + p))
        ];
    }

    * parseLine() {
        this.expectedStepNumber = parseInt(yield);
        this.radialGridPtNumber = parseInt(yield);
        this.speciesNumber = parseInt(yield);
        yield;
        this.particlePlotTypeNumber = parseInt(yield);
        this.fieldNumber = parseInt(yield);
        this.fieldPlotTypeNumber = parseInt(yield);

        this.initBlockSize = 7;
        this.entryPerStep = this.radialGridPtNumber *
            (this.speciesNumber * this.particlePlotTypeNumber +
                this.fieldNumber * this.fieldPlotTypeNumber)

        // Initialize
        this.data = new Object();
        for (let particle of this.existingParticles) {
            this.data[particle] = new Object();
            for (let type of particlePlotTypes) {
                this.data[particle][type] = new Array();
            }
        }
        for (let field of fieldTypes) {
            this.data[field] = new Object();
            for (let type of fieldPlotTypes) {
                this.data[field][type] = new Array();
            }
        }

        // read data
        while (true) {
            for (let particle of this.existingParticles) {
                for (let type of particlePlotTypes) {
                    const rl = [];
                    this.data[particle][type].push(rl);
                    for (let r = 0; r < this.radialGridPtNumber; r++) {
                        rl.push(parseFloat(yield))
                    }
                }
            }
            for (let type of fieldPlotTypes) {
                for (let field of fieldTypes) {
                    const rl = [];
                    this.data[field][type].push(rl);
                    for (let r = 0; r < this.radialGridPtNumber; r++) {
                        rl.push(parseFloat(yield))
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
                tickformat: '.4e'
            },
            transpose: true,
            zhoverformat: '.4g'
        })

        figure.axesLabel = { x: 'time step', y: 'mpsi' };
        figure.plotLabel = `${cat} ${type}`;

        return [figure];
    }
}

module.exports = RadialTime;