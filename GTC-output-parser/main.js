const History = require('./history.js');
const Snapshot = require('./snapshot.js');
const read_para = require('./read_para.js');

/**
 * GTC output data parser class
 * 
 * @param {String} dir - GTC output data directory path
 */
class GTCOutput {
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
     * read history.out
     */
    async history() {
        if (this.parameters) {
            this.historyData = await History.readHistoryFile(this.dir, this.parameters);
        } else {
            await this.read_para();
            this.historyData = await History.readHistoryFile(this.dir, this.parameters);
        }
    }

    /**
     * read snap*******.out
     * 
     * @param {number} num step number of snapshot file
     */
    async snapshot(num) {
        if (this.parameters) {
            this.snapshotData = await Snapshot.readSnapshotFile(this.dir, num, this.parameters);
        } else {
            await this.read_para();
            this.snapshotData = await Snapshot.readSnapshotFile(this.dir, num, this.parameters);
        }
    }
}

module.exports = GTCOutput;