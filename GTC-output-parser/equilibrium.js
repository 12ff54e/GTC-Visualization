const PlotType = require('./PlotType.js');
const PlotlyData = require('./PlotlyData.js');

// For parsing data in .out file
const dataType_1D = ['psi', 'sqrt_torpsi', 'minor', 'major',
    'Te', 'dlnTe_dpsi', 'ne', 'dlnne_dpsi',
    'Ti', 'dlnTi_dpsi', 'ni', 'dlnni_dpsi',
    'Tf', 'dlnTf_dpsi', 'nf', 'dlnnf_dpsi',
    'zeff', 'tor_rot', 'E_r', 'q', 'dlnq_dpsi',
    'g', 'p', 'minor', 'torpsi', 'rg',
    'psi_tor', 'psi_rg', 'sin_err', 'cos_err'];
const dataType_2D = ['x', 'z', 'b', 'J', 'i', 'zeta2phi', 'del'];

const displayName = {
    'psi': '\\psi',
    'Te': 'T_e',
    'dlnTe_dpsi': '\\frac{\\mathrm{d}\\ln T_e}{\\mathrm{d}\\psi}',
    'ne': 'n_e',
    'dlnne_dpsi': '\\frac{\\mathrm{d}\\ln n_e}{\\mathrm{d}\\psi}',
    'Ti': 'T_i',
    'dlnTi_dpsi': '\\frac{\\mathrm{d}\\ln T_i}{\\mathrm{d}\\psi}',
    'ni': 'n_i',
    'dlnni_dpsi': '\\frac{\\mathrm{d}\\ln n_i}{\\mathrm{d}\\psi}',
    'Tf': 'T_f',
    'dlnTf_dpsi': '\\frac{\\mathrm{d}\\ln T_f}{\\mathrm{d}\\psi}',
    'nf': 'n_f',
    'dlnnf_dpsi': '\\frac{\\mathrm{d}\\ln n_f}{\\mathrm{d}\\psi}',
    'zeff': 'Z_{\\mathrm{eff}}',
    'tor_rot': '\\mathrm{tor\\,rot}',
    'E_r': 'E_r',
    'q': 'q',
    'dlnq_dpsi': '\\frac{\\mathrm{d}\\ln q}{\\mathrm{d}\\psi}',
    'g': 'g',
    'p': 'p',
    'minor': 'r',
    'torpsi': '\\psi_t',
    'rg': 'r_g',
    'psi_tor': '\\psi\\;\\mathrm{on}\\;\\psi_p\\;\\mathrm{grid}',
    'psi_rg': '\\psi\\;\\mathrm{on}\\;\\r_g\\;\\mathrm{grid}',
    'sin_err': '\\sin\\;\\mathrm{error}',
    'cos_err': '\\cos\\;\\mathrm{error}',
    'b(theta)': 'B(\\psi_{\\mathrm{w}}, \\theta)',
    'J(theta)': 'J(\\psi_{\\mathrm{w}}, \\theta)'
}

/**
 * Equilibrium class contains all data from equilibrium.out
 */
class Equilibrium extends PlotType {
    /**
     * @param {string} filePath 
     */
    constructor(filePath) {
        super(filePath);

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
     * 
     * @param {string} id 
     */
    plotData(id) {
        const [type, ...sub] = id.split('-');
        let figure = new PlotlyData();

        if (type === '1D') {
            figure.data.push({
                x: this.radialData[sub[0]],
                y: this.radialData[sub[1]],
            })
            figure.axesLabel = { x: `$${displayName[sub[0]]}$`, y: '' };
            figure.plotLabel = `$${displayName[sub[1]]}$`;
        } else if (this.plotTypes.poloidalPlane.includes(type)) {
            const ind = this.plotTypes.poloidalPlane.indexOf(type);
            const psiw = this.radialData['psi'][this.radialGridPtNum1 - 1];
            const psiMesh = [...Array(this.radialGridPtNum2).keys()]
                .map(r => psiw * r / (this.radialGridPtNum2 - 1));
            const thetaMesh = [...Array(this.poloidalGridPtNum).keys()]
                .map(i => 2 * Math.PI * i / (this.poloidalGridPtNum - 1));
            figure.data.push({
                a: psiMesh,
                b: thetaMesh,
                x: this.poloidalPlaneData['x'],
                y: this.poloidalPlaneData['z'],
                type: 'carpet'
            });
            figure.axisEqual();
            figure.axesLabel = {x: '$\\text{R}$', y: '$\\text{Z}$'}

            // mesh grid
            if (ind == 0) {
                figure.hideCarpetGridTicks();
                figure.plotLabel = '$\\text{Poloidal plane mesh}$';
                return [figure];
            }

            figure.data.push({
                a: psiMesh,
                b: thetaMesh,
                z: this.poloidalPlaneData[dataType_2D[ind + 1]],
                type: 'contourcarpet',
                contours: {
                    showlines: false
                }
            });
            figure.hideCarpetGrid();
            figure.plotLabel = `$\\text{${type}}$`

        } else {
            switch (this.plotTypes.others.indexOf(type)) {
                case 0: // magnetic field along poloidal direction
                    figure.data.push({
                        y: this.poloidalPlaneData['b'].map(rs => rs[this.radialGridPtNum2 - 1])
                    });
                    break;
                case 1: // Jacobian along poloidal direction
                    figure.data.push({
                        y: this.poloidalPlaneData['J'].map(rs => rs[this.radialGridPtNum2 - 1])
                    });
                    break;
            }
            figure.addX(2 * Math.PI / (this.poloidalGridPtNum - 1), 0);
            figure.plotLabel = `$${displayName[type]}$`;
            figure.axesLabel = { x: '$\\theta$', y: '' }
        }

        return [figure];
    }
}

module.exports = Equilibrium;