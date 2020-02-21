/**
 * Class template for major figure types in gtc output
 */
class PlotType {
    /**
     * @param {{iter: Iterator<string>, path: string}} data 
     */
    constructor(data, basicParams) {
        this.path = data.path;
    }

    /**
     * Read given file 
     * @param {string} filePath 
     */
    static async readDataFile(filePath, basicParams) {
        const fileContent = await require('fs').promises.readFile(filePath, { encoding: 'utf8' });
        const data = fileContent.split('\n');

        return new this({
            iter: data[Symbol.iterator](),
            path: filePath
        }, basicParams);
    }

    /**
     * @param {{iter:Iterator<string>, path:string}} data 
     */
    static checkEnd(data) {
        let {iter, path} = data;
        let { value, done } = iter.next();
        if (done || !value) {
            console.log(`${path} read`);
        } else {
            throw new RangeError(`${path} has ${[...iter].length + 1} entries left`)
        }
    }
}

module.exports = PlotType;