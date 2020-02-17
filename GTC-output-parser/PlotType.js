/**
 * Class template for major figure types in gtc output
 */
class PlotType {
    /**
     * @param {{iter: Iterator<string>, path: string}} data 
     */
    constructor(data) {
        this.path = data.path;
    }

    /**
     * Read given file and return an object containing
     *  an iterator giving each line, and file path
     * @param {string} filePath 
     */
    static async readDataFile(filePath) {
        const fileContent = await require('fs').promises.readFile(filePath, {encoding: 'utf8'});
        const data = fileContent.split('\n');

        return {
            iter: data[Symbol.iterator](),
            path: filePath
        }
    }
}

module.exports =  PlotType;