const History = require('./history.js');
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

    async read_para() {
        this.parameters = await read_para(this.dir);
    }

    async history() {
        if (this.parameters) {
            this.historyData = await History.readHistoryFile(this.dir, this.parameters);
        } else {
            await this.read_para();
            this.historyData = await History.readHistoryFile(this.dir, this.parameters);
        }
    }

}

module.exports = GTCOutput;