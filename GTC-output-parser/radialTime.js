const PlotType = require('./PlotType.js');
const PlotlyData = require('./PlotlyData.js');

const particlePlotTypes =
    ['particle_flux', 'energy_flux', 'momentum_flux'];
const fieldNames = ['phi', 'a_para', 'fluid_ne'];
const fieldPlotTypes = ['zonal', 'rms'];

class RadialTime extends PlotType {
    /**
     * 
     * @param {{path: string, iter: Iterator<string>}} data 
     */
    constructor(data, basicParams) {
        super(data, basicParams);
        let iter = data.iter;

        this.stepNumber = parseInt(iter.next().value);
        this.radialGridPtNum = parseInt(iter.next().value);
        this.speciesNumber = parseInt(iter.next().value);
        iter.next();
        this.particlePlotTypeNum = parseInt(iter.next().value);
        this.fieldNum = parseInt(iter.next().value);
        this.fieldPlotTypeNum = parseInt(iter.next().value);

        this.plotTypes = [
            ...this.existingParticles.map(t => particlePlotTypes
                .slice(0, this.particlePlotTypeNum)
                .map(p => t + '-' + p)),
            ...fieldNames.map(f => fieldPlotTypes
                .slice(0, this.fieldPlotTypeNum)
                .map(p => f + '-' + p))
        ];

        this.data = new Object();
        // initialization
        for (let field of fieldNames) {
            this.data[field] = new Object();
        }
        for (let i = 0; i < this.stepNumber; i++) {
            // particle data
            for (let particle of this.existingParticles) {
                if (i == 0) {
                    this.data[particle] = new Object();
                }
                for (let type of particlePlotTypes) {
                    if (i == 0) {
                        this.data[particle][type] = new Array();
                    }
                    this.data[particle][type].push(
                        Array.from({ length: this.radialGridPtNum },
                            _ => parseFloat(iter.next().value)));
                }
            }

            // field data
            for (let type of fieldPlotTypes) {
                for (let field of fieldNames) {
                    if (i == 0) {
                        this.data[field][type] = new Array();
                    }
                    this.data[field][type].push(
                        Array.from({ length: this.radialGridPtNum },
                            _ => parseFloat(iter.next().value)));
                }
            }
        }

        PlotType.checkEnd(data);
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