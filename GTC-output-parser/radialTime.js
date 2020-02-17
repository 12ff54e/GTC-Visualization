const PlotType = require('./PlotType.js');
const PlotlyData = require('./PlotlyData.js');

const particleNames = ['ion', 'electron', 'EP', 'fast_electron']
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
        super(data);
        let iter = data.iter;

        this.stepNumber = parseInt(iter.next().value);
        this.radialGridPtNum = parseInt(iter.next().value);
        this.speciesNumber = parseInt(iter.next().value);
        iter.next();
        this.particlePlotTypeNum = parseInt(iter.next().value);
        this.fieldNum = parseInt(iter.next().value);
        this.fieldPlotTypeNum = parseInt(iter.next().value);

        // find out the particle(s) in data1d.out
        let { iload, nhybrid, fload, feload } = basicParams;
        this.existingParticles = particleNames.filter((_, i) =>
            [iload, nhybrid, fload, feload][i] > 0
        )

        this.plotTypes = [
            ...this.existingParticles.map(t => particlePlotTypes
                .slice(0, this.particlePlotTypeNum)
                .map(p => t + '-' + p)),
            ...fieldNames.map(f => fieldPlotTypes
                .slice(0, this.fieldPlotTypeNum)
                .map(p => f + '-' + p))
        ];

        this.data = new Object();
        for (let i = 0; i < this.stepNumber; i++) {
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

            for (let field of fieldNames) {
                if (i == 0) {
                    this.data[field] = new Object();
                }
                for (let type of fieldPlotTypes) {
                    if (i == 0) {
                        this.data[field][type] = new Array();
                    }
                    this.data[field][type].push(
                        Array.from({ length: this.radialGridPtNum },
                            _ => parseFloat(iter.next().value)));
                }
            }
        }

        // check if finished
        let { value, done } = iter;
        if (done || !value) {
            console.log(`${this.path} read`);
        } else {
            throw new Error(`${[...iter].length + 1} entries left`);
        }


    }

    /**
     * 
     * @param {string} filePath 
     */
    static async readRadialTimeFile(filePath, basicParams) {
        let data = await super.readDataFile(filePath);

        return new RadialTime(data, basicParams);
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
            }
        })

        figure.axesLabel = {x:'mpsi', y:'time step'};
        figure.plotLabel = `${cat} ${type}`;

        return [figure];
    }
}

module.exports = RadialTime;