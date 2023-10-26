const read_para = require('./read_para.js');
const { webStreamToText } = require('./util');

/**
 * GTC output data parser class
 *
 * This class is designed to be used on both server and client side (workers, to be specific).
 * Care must be taken when reading files. Codes dealing with differences of host mainly reside in
 * reading file contents, also in the treatment of file path.
 *
 * - Read file content: Use fs.createReadStream and fs.readFile at server side,
 *      stream or text method of File interface at client side.
 * - Match file path: We have `node:path` at server side. And everything is done by hand at client side.
 *
 */
class GTCOutput {
    /**
     * @param {String} dir - GTC output data directory path
     */
    constructor(dir, fileListOrNodeModules) {
        this.dir = dir;
        this.data = {};
        this.serverSide = !Array.isArray(fileListOrNodeModules);
        this._fileList = this.serverSide ? [] : fileListOrNodeModules;
        this._nodeModules = this.serverSide ? fileListOrNodeModules : {};
    }

    getFileByPath(...paths) {
        return this._fileList.find(file =>
            file.webkitRelativePath.endsWith(paths.join('/'))
        );
    }

    /**
     * Create a stream of given file
     * @returns {ReadStream|ReadableStream<Uint8Array>}
     */
    createReadStreamFromFile(...paths) {
        return this.serverSide
            ? this._nodeModules.fs.createReadStream(
                  this._nodeModules.path.join(this.dir, ...paths)
              )
            : this.getFileByPath(...paths).stream;
    }

    /**
     *
     * @param {string} filePath
     * @returns {Promise<string>}
     */
    async readFileContent(...paths) {
        return this.serverSide
            ? this._nodeModules.fs.promises.readFile(
                  this._nodeModules.path.join(this.dir, ...paths),
                  {
                      encoding: 'utf-8',
                  }
              )
            : webStreamToText(this.getFileByPath(...paths).stream);
    }

    /**
     * read gtc.out
     */
    async getParameters() {
        if (!this.parameters)
            this.parameters = await read_para(
                await this.readFileContent('gtc.out')
            );
        return this.parameters;
    }

    async check_tracking() {
        if (this.particleTrackingExist === undefined) {
            if (this.serverSide) {
                try {
                    const dir = await this._nodeModules.fs.promises.readdir(
                        this._nodeModules.path.join(
                            this.dir,
                            this.constructor.index['Tracking'].fileName
                        )
                    );
                    this.particleTrackingExist = dir.length !== 0;
                } catch (err) {
                    this.particleTrackingExist = false;
                }
            } else {
                this.particleTrackingExist =
                    this._fileList.findIndex(file =>
                        file.webkitRelativePath.includes(
                            this.constructor.index['Tracking'].fileName
                        )
                    ) > -1;
            }
        }
    }

    /**
     * get snapshot file name
     *
     * it is also possible to get snapshot file name from gtc.out,
     *  but one must consider the case when the gtc task still running
     */
    async getSnapshotFileList() {
        let files = this.serverSide
            ? await this._nodeModules.fs.promises.readdir(this.dir)
            : this._fileList.map(file =>
                  file.webkitRelativePath.split('/').at(-1)
              );
        return (this.snapshotFiles = files
            .map(name => name.toLowerCase())
            .filter(name => name.startsWith('snap') && name.endsWith('.out')));
    }

    /**
     * read .out file according to type
     * @param {string} type could be 'History', 'Equilibrium', 'RadialTime' or one of the snapshot files
     */
    async readData(type) {
        // read corresponding data file
        if (this.data[type] === undefined) {
            await this.getParameters();
            if (type === 'Tracking') {
                await this.readData('Equilibrium');
            }
            let { classConstructor, fileName } =
                GTCOutput.index[type.startsWith('snap') ? 'Snapshot' : type];
            if (type.startsWith('snap')) {
                fileName = type;
                this.snapshotFileName = type;
            }
            // FIXME: tracking plot is broken
            this.data[type] = await classConstructor.readDataFile(
                fileName,
                this.createReadStreamFromFile(fileName),
                this.parameters,
                this.serverSide,
                this._nodeModules
            );
        }

        return this.data[type];
    }

    getPlotData(type, id) {
        if (type === 'Tracking') {
            return this.data[type].plotData(id, this.data['Equilibrium']);
        } else if (type === 'Snapshot') {
            return this.data[this.snapshotFileName].plotData(
                id,
                this.parameters
            );
        } else {
            return this.data[type].plotData(id, this.parameters);
        }
    }
}

GTCOutput.index = {
    History: {
        classConstructor: require('./history.js'),
        fileName: 'history.out',
    },
    Snapshot: {
        classConstructor: require('./snapshot.js'),
        fileName: '',
    },
    Equilibrium: {
        classConstructor: require('./equilibrium.js'),
        fileName: 'equilibrium.out',
    },
    RadialTime: {
        classConstructor: require('./radialTime.js'),
        fileName: 'data1d.out',
    },
    Tracking: {
        classConstructor: require('./tracking.js'),
        fileName: 'trackp_dir',
    },
};

module.exports = GTCOutput;
