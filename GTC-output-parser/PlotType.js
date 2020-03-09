/**
 * Class template for major figure types in gtc output
 */
class PlotType {
    /**
     * @param {string} filePath 
     * @param {object} basicParams GTCOutput.parameters
     */
    constructor(filePath, basicParams) {
        this.path = filePath;

        if (basicParams) {
            let { iload, nhybrid, fload, feload } = basicParams;
            this.existingParticles =
                ['ion', 'electron', 'EP', 'fast_electron'].filter((_, i) => {
                    return [iload, nhybrid, fload, feload][i] > 0
                });
        }

        this.isTimeSeriesData = false;
        this.initBlockSize = 0;
        this.entryPerStep = 1;
        this.expectedStepNumber = 1;
        this.isCompleted = true;
    }

    /**
     * Read given file. Subclass should implement their own parseLine 
     *  static method as a generator.
     * Subclass should set  isTimeSeriesData` property to indicate whether
     *  data it read are times series. If so, set `initBlockSize`, `entryPerStep`
     *  and `expectedStepNumber` property for completion check. 
     * These value will be checked after final call of `parseLine().next()`.
     * 
     * @param {string} filePath 
     * @param {object} basicParams GTCOutput.parameters
     */
    static async readDataFile(filePath, basicParams) {
        const { once } = require('events');
        const { createReadStream } = require('fs');
        const { createInterface } = require('readline');

        const rl = createInterface({
            input: createReadStream(filePath),
            ctrlDelay: Infinity
        });

        const data = new this(filePath, basicParams);

        const parser = data.parseLine();
        // parameter of first invoke of .next() will be omitted
        parser.next();

        let lineNum = 0;
        rl.on('line', line => {
            parser.next(line);
            lineNum++;
        });

        await once(rl, 'close');

        // formal way to check the length of time series data
        if (data.isTimeSeriesData) {
            data.stepNumber =
                Math.floor((lineNum - data.initBlockSize)/ data.entryPerStep);
            data.isCompleted = data.expectedStepNumber === data.stepNumber;
        }

        console.log(`${filePath} read`);

        return data;
    }

    /**
     * @param {{iter:Iterator<string>, path:string}} data 
     */
    static checkEnd(data) {
        let { iter, path } = data;
        let { value, done } = iter.next();
        if (done || !value) {
            console.log(`${path} read`);
        } else {
            throw new RangeError(`${path} has ${[...iter].length + 1} entries left`)
        }
    }
}

module.exports = PlotType;