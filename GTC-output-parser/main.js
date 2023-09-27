const fs = require('fs').promises;
const path = require('path');
const read_para = require('./read_para.js');

/**
 * GTC output data parser class
 * 
 */
class GTCOutput {
    /**
     * @param {String} dir - GTC output data directory path
     */
    constructor(dir) {
        this.dir = dir;
        this.data = {}
    }

    /**
     * read gtc.out
     */
    async read_para() {
        if (!this.parameters) this.parameters = await read_para(this.dir);
        return this.parameters;
    }

    async check_tracking() {
        if (this.particleTrackingExist === undefined) {
            try {
                const dir = await fs.readdir(
                    path.join(this.dir, this.constructor.index['Tracking'].fileName)
                );
                this.particleTrackingExist = dir.length !== 0;
            } catch (err) {
                this.particleTrackingExist = false;
            }
        }
    }

    /**
     * get snapshot file name
     * 
     * it is also possible to get snapshot file name from gtc.out,
     *  but one must consider the case when the gtc task still running
     */
    async getSnapshotFileList() {
        let files = await fs.readdir(this.dir, 'utf8');
        this.snapshotFiles = files
            .map(name => name.toLowerCase())
            .filter(name => name.startsWith('snap') && name.endsWith('.out'));
    }

    /**
     * read .out file according to type
     * @param {string} type could be 'History', 'Equilibrium', 'RadialTime' or one of the snapshot files
     */
    async readData(type) {
        if (type.startsWith('snap')) {
            // check if the requested snapshot file is read
            this.snapshotFileName = type;
            type = 'Snapshot';
            let snap = this.data[type];
            if (snap && path.basename(snap.path) === this.snapshotFileName) {
                return;
            }
        } else if (this.data[type]) {
            // check if the requested file (except for snapshot) is read
            return;
        }

        await this.read_para();
        if (type === 'Tracking') {
            await this.readData('Equilibrium');
        }
        let { classConstructor, fileName } = GTCOutput.index[type];
        this.data[type] =
            await classConstructor.readDataFile(
                path.join(this.dir, fileName ? fileName : this.snapshotFileName),
                this.parameters);
    }

    getPlotData(type, id) {
        if (type === 'Tracking') {
            return this.data[type].plotData(id, this.data['Equilibrium']);
        } else {
            return this.data[type].plotData(id, this.parameters);
        }
    }
}

GTCOutput.index = {
    'History': {
        classConstructor: require('./history.js'),
        fileName: 'history.out'
    },
    'Snapshot': {
        classConstructor: require('./snapshot.js'),
        fileName: ''
    },
    'Equilibrium': {
        classConstructor: require('./equilibrium.js'),
        fileName: 'equilibrium.out'
    },
    'RadialTime': {
        classConstructor: require('./radialTime.js'),
        fileName: 'data1d.out'
    },
    'Tracking': {
        classConstructor: require('./tracking.js'),
        fileName: 'trackp_dir'
    }
}



module.exports = GTCOutput;