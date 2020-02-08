const fs = require('fs').promises;
const path = require('path');
const PlotlyData = require('./PlotlyData.js')

const particleNames = ['ion', 'electron', 'EP', 'fast_electron']
const particlePlotTypes =
    ['density', 'flow', 'energy', 'PDF_energy', 'PDF_pitch'];
const fieldNames = ['phi', 'a_para', 'fluid_ne'];
const fieldPlotTypes = ['flux', 'spectrum', 'poloidal', 'psi', 'theta'];

/**
 * Snapshot class containing all data from snap*******.out
 */
class Snapshot {
    /**
     * @param {Array<string>} snapshotData 
     * @param {Object} basicParams GTCOutput.parameters
     */
    constructor(snapshotData, basicParams) {
        if (snapshotData.dir === undefined) {
            throw new Error('The constructor of History cannot be called directly.');
        }

        this.dir = snapshotData.dir;

        let iter = snapshotData[Symbol.iterator]();

        // basic parameters
        this.speciesNum = parseInt(iter.next().value);
        this.fieldNumber = parseInt(iter.next().value);
        this.velocityGridNumber = parseInt(iter.next().value);
        this.radialGridPtNum = parseInt(iter.next().value);
        this.poloidalGridPtNum = parseInt(iter.next().value) - 1;
        this.toroidalGridPtNum = parseInt(iter.next().value);
        this.maxEnergy = parseFloat(iter.next().value);

        // find out the particle(s) in snap*******.out
        let { iload, nhybrid, fload, feload } = basicParams;
        this.existingParticles = particleNames.filter((_, i) =>
            [iload, nhybrid, fload, feload][i] > 0
        )

        this.plotTypes = [
            ...this.existingParticles.map(t => particlePlotTypes.map(p => t + '_' + p)),
            ...fieldNames.map(f => fieldPlotTypes.map(p => f + '_' + p))
        ];

        // particle data, including profile of torques and pdf of energy and pitch angle
        this.particleData = new Object();
        // first three panel of particlePlotTypes, dimension = (r)
        this._slice_particle(iter, 0, 3, this.radialGridPtNum);
        // next two panel of particlePlotTypes, dimension = (v)
        this._slice_particle(iter, 3, 5, this.velocityGridNumber);

        // field data, including poloidal plane and flux 
        this.fieldData = new Object();
        // poloidal plane data, with x and y coordinates, dimension = (fieldNum + 2 ,r, theta)
        this._slice_field(iter, 'poloidalPlane', this.radialGridPtNum);
        // flux data, dimension = (fieldNum, zeta, theta)
        this._slice_field(iter, 'fluxData', this.toroidalGridPtNum);

        // check if the snap*******.out file ends
        let {value, done} = iter.next();
        if (done || !value) {
            console.log(`${this.dir} read`);
        } else {
            console.log(`${[...iter].length} entries left`);
        }
    }

    /**
     * Asynchronously read snapshot file
     * 
     * @param {string} dir path
     * @param {number} num step number of snapshot file
     */
    static async readSnapshotFile(dir, num, basicParams) {
        const fileName = 'snap' + num.toString().padStart(7, '0') + '.out';
        const snapDir = path.join(dir, fileName);
        const snapshotFile = await fs.readFile(snapDir, 'utf-8');
        const snapshotData = snapshotFile.split('\n');

        snapshotData.dir = snapDir;

        return new Snapshot(snapshotData, basicParams);
    }

    /**
     * Generate plot data as per specifications of Plotly library.
     * 
     * @param {string} id plot id
     */
    plotType(id) {
        // cat is the category of the plot, could be particle name or field name
        // type is the type of the plot, one of strings in particlePlotType or fieldPlotType
        let [cat, type] = id.split('_', 2);
    }

    _slice_particle(iter, m, n, len) {
        for (let particle of this.existingParticles) {
            if (this.particleData[particle] === undefined) {
                this.particleData[particle] = new Object();
            }
            for (let type = m; type < n; type++) {
                this.particleData[particle][particlePlotTypes[type]] =
                    Array.from({ length: 2 },
                        _ => Array.from({ length: len },
                            _ => parseFloat(iter.next().value)));
            }
        }
    }

    _slice_field(iter, type, len) {
        this.fieldData[type] = new Object();
        for (let field of fieldNames.concat(type === 'poloidalPlane' ? ['x', 'y'] : [])) {
            let tmp = this.fieldData[type][field] = new Array();
            for (let r = 0; r < len; r++) {
                tmp.push(Array.from({ length: this.poloidalGridPtNum + 1 },
                    _ => parseFloat(iter.next().value)));
            }
        }
    }

}

module.exports = Snapshot;
