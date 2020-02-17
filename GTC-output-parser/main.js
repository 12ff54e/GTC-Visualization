const fs = require('fs').promises;
const path = require('path');
const History = require('./history.js');
const Snapshot = require('./snapshot.js');
const Equilibrium = require('./equilibrium.js');
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
            .filter(file => file.startsWith('snap'));
    }

    /**
     * read history.out
     */
    async history() {
        if (this.historyData) {
            // if history file has been read
            return;
        } else if (this.parameters) {
            this.historyData = await History.readHistoryFile(this.dir, this.parameters);
        } else {
            await this.read_para();
            this.historyData = await History.readHistoryFile(this.dir, this.parameters);
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
        if(this.equilibriumData) {
            return;
        } else {
            this.equilibriumData =
                await Equilibrium.readEquilibriumFile(path.join(this.dir, 'equilibrium.out'));
        }
    }
}

module.exports = GTCOutput;