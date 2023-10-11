const { parseStreamByLine, parseWebStreamByLine } = require('./util.js');

/**
 * Class template for major figure types in gtc output
 */
class PlotType {
    /**
     * @param {string} filename
     * @param {object} basicParams GTCOutput.parameters
     */
    constructor(filename, basicParams) {
        this.filename = filename;

        if (basicParams) {
            let { iload, nhybrid, fload, feload } = basicParams;
            this.existingParticles = [
                'ion',
                'electron',
                'EP',
                'fast_electron',
            ].filter((_, i) => {
                return [iload, nhybrid, fload, feload][i] > 0;
            });
        }

        this.isTimeSeriesData = false;
        this.initBlockSize = 0;
        this.entryPerStep = 1;
        this.expectedStepNumber = 1;
        this.isCompleted = true;
    }

    /**
     * Read given file. Subclass should implement their own parseLine method
     *  as a generator.
     * Subclass should set `isTimeSeriesData` property to indicate whether
     *  data it read are times series. If so, set `initBlockSize`, `entryPerStep`
     *  and `expectedStepNumber` property for completion check.
     * These value will be checked after final call of `parseLine().next()`.
     *
     * @param {string} filename
     * @param {object} basicParams GTCOutput.parameters
     */
    static async readDataFile(filename, stream, basicParams, serverSide) {
        // For error handling
        // await require('fs/promise').stat(filePath);

        const data = new this(filename, basicParams);

        const parser = data.parseLine();
        // parameter of first invoke of .next() will be omitted
        parser.next();

        const lineNum = await (serverSide
            ? parseStreamByLine(stream, parser)
            : parseWebStreamByLine(stream, parser));

        // formal way to check the length of time series data
        if (data.isTimeSeriesData) {
            data.stepNumber = Math.floor(
                (lineNum - data.initBlockSize) / data.entryPerStep
            );
            data.isCompleted = data.expectedStepNumber === data.stepNumber;
        }

        console.log(`${filename} read`);

        return data;
    }
}

PlotType.fieldID = ['phi', 'a_para', 'fluid_ne'];
PlotType.fieldDisplayName = {
    phi: '\\phi',
    a_para: '\\delta A_{\\parallel}',
    fluid_ne: '\\mathrm{fluid}\\,n_e',
};

module.exports = PlotType;
