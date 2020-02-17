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

// For figure generation
const xDataTypes = ['psi', 'minor', 'torpsi', 'rg'];
const yDataTypes = ['psi',
    'Te', 'dlnTe_dpsi', 'ne', 'dlnne_dpsi',
    'Ti', 'dlnTi_dpsi', 'ni', 'dlnni_dpsi',
    'Tf', 'dlnTf_dpsi', 'nf', 'dlnnf_dpsi',
    'zeff', 'tor_rot', 'E_r', 'q', 'dlnq_dpsi',
    'g', 'p', 'minor', 'tor_psi', 'rg',
    'psi_tor', 'psi_rg', 'sin_err', 'cos_err'];
const poloidalPlanePlotTypes = ['splineMesh', 'bField', 'Jacobian', 'iCurrent', 'zeta2phi', 'delB'];
const otherPlotTypes = ['b(theta)', 'J(theta)']

/**
 * Equilibrium class contains all data from equilibrium.out
 */
class Equilibrium extends PlotType {
    /**
     * @param {{iter: Iterator<string>, path: string}} eqData 
     * @param {object} basicParams GTCOutput.parameters
     */
    constructor(eqData) {
        super(eqData);
        let iter = eqData.iter;


        this.plotTypes = {
            xDataTypes: xDataTypes,
            yDataTypes: yDataTypes,
            poloidalPlanePlotTypes: poloidalPlanePlotTypes,
            otherPlotTypes: otherPlotTypes
        }

        this.radialPlotNum = parseInt(iter.next().value) + 1;
        this.radialGridPtNum1 = parseInt(iter.next().value);

        this.radialData = new Object();
        for (let i = 0; i < this.radialPlotNum; i++) {
            let arr = this.radialData[dataType_1D[i]] = new Array();
            for (let r = 0; r < this.radialGridPtNum1; r++) {
                arr.push(parseFloat(iter.next().value));
            }
        }

        this.poloidalPlanePlotNum = parseInt(iter.next().value) + 2;
        this.radialGridPtNum2 = parseInt(iter.next().value);
        this.poloidalGridPtNum = parseInt(iter.next().value);

        this.poloidalPlaneData = new Object();
        for (let i = 0; i < this.poloidalPlanePlotNum; i++) {
            let arr = this.poloidalPlaneData[dataType_2D[i]] = new Array();
            for (let t = 0; t < this.poloidalGridPtNum; t++) {
                arr.push(new Array());
                for (let r = 0; r < this.radialGridPtNum2; r++) {
                    arr[t].push(parseFloat(iter.next().value));
                }
            }
        }

        let { value, done } = iter.next();
        // last line could be empty
        if (done || !value) {
            console.log(`${this.path} read`);
        } else {
            throw new Error(`${[...iter].length + 1} entries left`);
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
        } else if (poloidalPlanePlotTypes.includes(type)) {
            let ind = poloidalPlanePlotTypes.indexOf(type);
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
            })

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

        } else if (otherPlotTypes.includes(type)) {
            let ind = otherPlotTypes.indexOf(type);
            switch (ind) {
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