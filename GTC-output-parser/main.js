const fs = require('fs').promises;
const path = require('path');
const History = require('./history.js');
const Snapshot = require('./snapshot.js');
const Equilibrium = require('./equilibrium.js');
const RadialTime = require('./radialTime.js');
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
    async getSnapshotList() {
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
            let snap = this.data['Snapshot'];
            if (snap && path.basename(snap.path) === type) {
                return;
            }
            this.snapshotFileName = type;
            type = 'Snapshot';
        } else if (this.data[type]) {
            // check if the requested file (except for snapshot) is read
            return;
        }

        if (this.parameters) {
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

    /**
     * read history.out
     */
    async history() {
        if (this.historyData) {
            // if history file has been read
            return;
        } else if (this.parameters) {
            this.historyData =
                await History.readDataFile(path.join(this.dir, 'history.out'), this.parameters);
        } else {
            await this.read_para();
            await this.history();
        }
    }

    /**
     * read snap*******.out
     * 
     * @param {string} file name of snapshot file
     */
    async snapshot(file) {
        if (this.snapshotData && path.basename(this.snapshotData.path) === file) {
            // if the specified snapshot file has been already read
            return;
        } else if (this.parameters) {
            this.snapshotData = await Snapshot.readSnapshotFile(this.dir, file, this.parameters);
        } else {
            await this.read_para();
            this.snapshotData = await Snapshot.readSnapshotFile(this.dir, file, this.parameters);
        }
    }

    async equilibrium() {
        if (this.equilibriumData) {
            return;
        } else {
            this.equilibriumData =
                await Equilibrium.readEquilibriumFile(path.join(this.dir, 'equilibrium.out'));
        }
    }

    async radialTime() {
        if (this.radialTimeData) {
            return;
        } else if (this.parameters) {
            this.radialTimeData =
                await RadialTime.readRadialTimeFile(path.join(this.dir, 'data1d.out'), this.parameters);
        } else {
            await this.read_para();
            await this.radialTime();
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