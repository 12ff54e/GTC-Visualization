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
        //TODO: should check existence of gtc.out here
    }

    /**
     * read gtc.out
     */
    async read_para() {
        this.parameters = await read_para(this.dir);
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
            if (snap && path.basename(snap.path) === type) {
                return;
            }
        } else if (this.data[type]) {
            // check if the requested file (except for snapshot) is read
            return;
        }

        if (this.parameters || type === 'Equilibrium') {
            let { classConstructor, fileName } = GTCOutput.index[type];
            this.data[type] =
                await classConstructor.readDataFile(
                    path.join(this.dir, fileName ? fileName : this.snapshotFileName),
                    this.parameters);
        } else {
            await this.read_para();
            await this.readData(type);
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
    }
}



module.exports = GTCOutput;