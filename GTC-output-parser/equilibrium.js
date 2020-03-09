const PlotType = require('./PlotType.js');
const PlotlyData = require('./PlotlyData.js');
const { flat } = require('./util.js');

// For parsing data in .out file
const dataType_1D = ['psi', 'sqrt_torpsi', 'minor', 'major',
    'Te', 'dlnTe_dpsi', 'ne', 'dlnne_dpsi',
    'Ti', 'dlnTi_dpsi', 'ni', 'dlnni_dpsi',
    'Tf', 'dlnTf_dpsi', 'nf', 'dlnnf_dpsi',
    'zeff', 'tor_rot', 'E_r', 'q', 'dlnq_dpsi',
    'g', 'p', 'minor', 'tor_psi', 'rg',
    'psi_tor', 'psi_rg', 'sin_err', 'cos_err'];
const dataType_2D = ['x', 'z', 'b', 'J', 'i', 'zeta2phi', 'del'];

/**
 * Equilibrium class contains all data from equilibrium.out
 */
class Equilibrium extends PlotType {
    /**
     * @param {{iter: Iterator<string>, path: string}} data 
     * @param {object} basicParams GTCOutput.parameters
     */
    constructor(data) {
        super(data);

        this.plotTypes = {
            x: ['psi', 'minor', 'torpsi', 'rg'],
            y: ['psi',
                'Te', 'dlnTe_dpsi', 'ne', 'dlnne_dpsi',
                'Ti', 'dlnTi_dpsi', 'ni', 'dlnni_dpsi',
                'Tf', 'dlnTf_dpsi', 'nf', 'dlnnf_dpsi',
                'zeff', 'tor_rot', 'E_r', 'q', 'dlnq_dpsi',
                'g', 'p', 'minor', 'tor_psi', 'rg',
                'psi_tor', 'psi_rg', 'sin_err', 'cos_err'],
            poloidalPlane: ['splineMesh', 'bField', 'Jacobian',
                'iCurrent', 'zeta2phi', 'delB'],
            others: ['b(theta)', 'J(theta)']
        }

    }

    * parseLine() {
        this.radialPlotNum = parseInt(yield) + 1;
        this.radialGridPtNum1 = parseInt(yield);

        this.radialData = new Object();
        for (let i = 0; i < this.radialPlotNum; i++) {
            let arr = this.radialData[dataType_1D[i]] = new Array();
            for (let r = 0; r < this.radialGridPtNum1; r++) {
                arr.push(parseFloat(yield));
            }
        }

        this.poloidalPlanePlotNum = parseInt(yield) + 2;
        this.radialGridPtNum2 = parseInt(yield);
        this.poloidalGridPtNum = parseInt(yield);

        this.poloidalPlaneData = new Object();
        for (let i = 0; i < this.poloidalPlanePlotNum; i++) {
            let arr = this.poloidalPlaneData[dataType_2D[i]] = new Array();
            for (let t = 0; t < this.poloidalGridPtNum; t++) {
                arr.push(new Array());
                for (let r = 0; r < this.radialGridPtNum2; r++) {
                    arr[t].push(parseFloat(yield));
                }
            }
        }

    }

    /**
     * read equilibrium.out
     * 
     * @param {string} filePath 
     * @param {object} basicParams GTCOutput.parameters
     */
    static async readEquilibriumFile(filePath) {
        const data = await super.readDataFile(filePath);

        return new Equilibrium(data);
    }

    /**
     * 
     * @param {string} id 
     */
    plotData(id) {
        let [type, ...sub] = id.split('-');
        let figure = new PlotlyData();

        if (type === '1D') {
            figure.data.push({
                x: this.radialData[sub[0]],
                y: this.radialData[sub[1]],
            })
            figure.axesLabel = { x: sub[0], y: '' };
            figure.plotLabel = sub[1];
        } else if (this.plotTypes.poloidalPlane.includes(type)) {
            let ind = this.plotTypes.poloidalPlane.indexOf(type);
            let psiMesh = flat(Array(this.poloidalGridPtNum)
                .fill([...Array(this.radialGridPtNum2).keys()]));
            let thetaMesh = flat([...Array(this.poloidalGridPtNum).keys()]
                .map(i => Array(this.radialGridPtNum2).fill(i)))
            figure.data.push({
                a: psiMesh,
                b: thetaMesh,
                x: flat(this.poloidalPlaneData['x']),
                y: flat(this.poloidalPlaneData['z']),
                type: 'carpet'
            });
            figure.axisEqual();

            // mesh grid
            if (ind == 0) {
                figure.hideCarpetGridTicks();
                figure.plotLabel = 'Poloidal Plane Mesh';
                return [figure];
            }

            figure.data.push({
                a: psiMesh,
                b: thetaMesh,
                z: flat(this.poloidalPlaneData[dataType_2D[ind + 1]]),
                type: 'contourcarpet',
                contours: {
                    showlines: false
                }
            });
            figure.hideCarpetGrid();
            figure.plotLabel = type

        } else {
            switch (this.plotTypes.others.indexOf(type)) {
                case 0: // magnetic field along poloidal direction
                    figure.data.push({
                        y: this.poloidalPlaneData['b'].map(rs => rs[this.radialGridPtNum2 - 1])
                    });
                    figure.plotLabel = 'b field at psiw'
                    break;
                case 1: // Jacobian along poloidal direction
                    figure.data.push({
                        y: this.poloidalPlaneData['J'].map(rs => rs[this.radialGridPtNum2 - 1])
                    });
                    figure.plotLabel = 'Jacobian at psiw'
                    break;
            }
            figure.addX(2 * Math.PI / (this.poloidalGridPtNum - 1), 0);
            figure.axesLabel = { x: 'theta', y: '' }
        }

        return [figure];
    }
}

module.exports = Equilibrium;