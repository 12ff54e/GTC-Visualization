const PlotType = require('./PlotType.js');
const fs = require('fs').promises;

class Tracking extends PlotType {
    /**
     * @param {{path: string, iterArray: Array<{iter: Iterator<string>, path: string}>}} data 
     * @param {object} basicParams GTCOutput.parameters
     */
    constructor(data) {
        super(data);
        this.steps = new Array();
        this.plotTypes = ['random_pick']

        do stepLoop: {
            // concat particle coordinate of one step from all files
            let allParticles = new Array();
            let thisStep;
            for (let proc of data.iterArray) {
                let { particleArray, step, done } = readOneStep(proc.iter)
                if (done) break stepLoop;
                allParticles.push(...particleArray);
                thisStep = step;
            }
            this.steps.push(thisStep);

            // create container at first step
            if (!this.particleData) {
                this.particleData = Array.from({ length: allParticles.length }, _ => []);
            }
            // sort tags to guarantee each sub-array of this.particleData
            //  stores the same particle
            allParticles
                .sort(({ tag: a }, { tag: b }) => compareTag(a, b))
                .forEach((p, i) => {
                    this.particleData[i].push(p.coordinate);
                })

        } while (true)
    }

    /**
     * 
     * @param {string} dir
     * @param {object} basicParams GTCOutput.parameters
     */
    static async readTrackingFiles(dir) {
        let tracks = new Array();
        for (let file of await fs.readdir(dir)) {
            if (file.startsWith('TRACKP')) {
                tracks.push(await super.readDataFile(file));
            }
        }

        return new Tracking({
            path: dir,
            iterArray: tracks
        });
    }

    plotData(id) {
        
    }
}

module.exports = Tracking;

/**
 * 
 * @param {Iterator<string>} iter 
 * 
 * @returns {Array<{coordinate: Array<Number>, tag: Array<Number>}>} a particle array
 */
function readOneStep(iter) {
    let { value, done } = iter.next();
    if (done || !value) {
        return { done: true };
    }

    let step = parseInt(value);
    let particleNum = parseInt(iter.next().value);
    let particleArray = new Array();

    for (let i = 0; i < particleNum; i++) {
        let coord = iter.next().value.split(' ').map(x => parseFloat(x));
        let tag = iter.next().value.split(' ').map(x => parseInt(x));
        particleArray.push({
            coordinate: coord,
            tag: tag
        })
    }

    return {
        particleArray: particleArray,
        step: step,
    };
}

/**
 * compare tags to determine order, tag is ordered number pair
 * @param {Array<number>} a 
 * @param {Array<number>} b 
 */
function compareTag(a, b) {
    let [ah, al] = a;
    let [bh, bl] = b;

    return ah === bh ? al - bl : ah - bh;
}