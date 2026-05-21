const PlotType = require('./PlotType.js');
const PlotlyData = require('./PlotlyData.js');

const particlePlotTypes =
    ['particle_flux', 'energy_flux', 'momentum_flux'];
const fieldPlotTypes = ['zonal', 'rms'];

class RadialTime extends PlotType {
    /**
     * 
     * @param {string} filePath 
     */
    constructor(filePath, basicParams) {
        super(filePath, basicParams);
        this.isTimeSeriesData = true;

        this.plotTypes = [
            ...PlotType.fieldID.map(f =>
                fieldPlotTypes
                    .slice(0, this.fieldPlotTypeNumber)
                    .map(p => f + '-' + p)
            ),
            ...this.existingParticles.map(t =>
                particlePlotTypes
                    .slice(0, this.particlePlotTypeNumber)
                    .map(p => t + '-' + p)
            ),
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

        this.deal_with_particle_species(particlePlotTypes);

        // Initialize
        this.data = new Object();
        for (let particle of this.existingParticles) {
            this.data[particle] = new Object();
            for (let type of particlePlotTypes) {
                this.data[particle][type] = new Array();
            }
        }
        for (let field of PlotType.fieldID) {
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
                for (let field of PlotType.fieldID) {
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
    plotData(id, basicParams, query = {}) {
        let [cat, type] = id.split('-');

        let figure = new PlotlyData();

        const baseTimeStep = basicParams.ndiag * basicParams.tstep;
        const timeUnit = query.timeUnit || 'R0Cs';
        const scaleMap = {
            R0Cs: 1,
            R0Va: Number(query.vaOverCs) > 0 ? Number(query.vaOverCs) : 1,
            tstep: 1 / basicParams.tstep,
        };
        const unitLabel = {
            R0Cs: '$R_0/c_s$',
            R0Va: '$R_0/v_A$',
            tstep: '$tstep$',
        };
        const timeStep = baseTimeStep * (scaleMap[timeUnit] || 1);
        const stepCount = this.data[cat][type].length;

        figure.data.push({
            x: Array.from({ length: stepCount }, (_, i) => (i + 1) * timeStep),
            z: this.data[cat][type],
            type: 'heatmap',
            colorbar: {
                tickformat: '.4e'
            },
            transpose: true,
            zhoverformat: '.4g'
        })

        figure.axesLabel = { x: unitLabel[timeUnit] || '$R_0/c_s$', y: '$\\text{mpsi}$' };
        figure.plotLabel = `$${PlotType.fieldID.includes(cat) ? PlotType.fieldDisplayName[cat] : `\\mathrm{${cat}}`}\\;`
            + `\\text{${type.replace('_',' ')}}$`;

        return [figure];
    }
}

module.exports = RadialTime;
