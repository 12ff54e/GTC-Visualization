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
            this.existingParticles = PlotType.particle_ID.filter((_, i) => {
                return [iload, nhybrid, fload, feload][i] > 0;
            });
            if (basicParams.magnetic > 0) {
                this.servingFields = PlotType.field_ID;
            } else {
                this.servingFields = PlotType.field_ID.slice(0, 1);
            }
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
     * @param {string} filePath
     * @param {object} basicParams GTCOutput.parameters
     */
    static async readDataFile(filePath, basicParams) {
        const { once } = require('events');
        const {
            createReadStream,
            promises: { stat },
        } = require('fs');
        const { createInterface } = require('readline');

        // For error handling
        await stat(filePath);

        const rl = createInterface({
            input: createReadStream(filePath).on('error', err =>
                console.log(err)
            ),
            ctrlDelay: Infinity,
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
            data.stepNumber = Math.floor(
                (lineNum - data.initBlockSize) / data.entryPerStep
            );
            data.isCompleted = data.expectedStepNumber === data.stepNumber;
        }

        console.log(`${filePath} read`);

        return data;
    }

    deal_with_particle_species(particlePlotTypes) {
        if (this.speciesNumber > this.existingParticles.length) {
            // unknown particle exists
            for (
                let i = this.existingParticles.length;
                i < this.speciesNumber;
                i++
            ) {
                const particle_name = `unknown${
                    i - this.existingParticles.length
                }`;
                this.existingParticles.push(particle_name);
                this.plotTypes.push(
                    particlePlotTypes.map(p => `${particle_name}-${p}`)
                );
            }
        }
    }
}

PlotType.field_ID = ['phi', 'a_para', 'fluid_ne'];
PlotType.particle_ID = ['ion', 'electron', 'EP', 'fast_electron'];
PlotType.index_lookup = id =>
    Object.fromEntries(
        [PlotType.field_ID, PlotType.particle_ID]
            .flat()
            .map((id, idx) => [id, idx])
    )[id];  
PlotType.fieldDisplayName = {
    phi: '\\phi',
    a_para: '\\delta A_{\\parallel}',
    fluid_ne: '\\mathrm{fluid}\\,n_{e}',
};

module.exports = PlotType;