const express = require('express');
require('dotenv').config();
const GTCOutput = require('./GTC-output-parser/main.js');
const path = require('path');
const compression = require('compression');
const FileTree = require('./fileTree.js');
const fs = require('fs').promises;
const Ajv = require('ajv');
const pug = require('pug');

const input_schema = require('./input-parameters-schema.json');
const { spawn } = require('child_process');
const { tmpdir } = require('os');
const { unlink, readdir } = require('fs/promises');

const app = express();
const port = process.env.PORT || 3000;
const processLimit = process.env.LIMIT || 50;
const host_dir = process.env.HOST_DIR || require('os').homedir();

validateInputSchema().catch(err => {
    console.log(err);
});

let output = {};

app.use(compression());
app.use(express.static('./public'));
app.use(express.urlencoded({ extended: true }));
app.disable('x-powered-by');

app.listen(port);

console.log(`Server is running at http://127.0.0.1:${port}`);

function pugView(fileBasename) {
    return path.join(__dirname, 'views', `${fileBasename}.pug`);
}

function wrap(func) {
    return (...args) => func(...args).catch(args[2]);
}

app.get(
    '/',
    wrap(async (req, res) => {
        const html = await getFolderStructure(path.normalize(host_dir));
        await fs.writeFile(path.join(__dirname, 'views', 'files.html'), html);
        res.send(pug.renderFile(pugView('index')));
    })
);

app.post(
    '/',
    wrap(async (req, res) => {
        const GTC_outputDir = path.join(
            path.basename(host_dir) ? path.dirname(host_dir) : host_dir,
            decodeURI(req.body.gtc_output)
        );
        let currentOutput;
        if ((currentOutput = output[req.body.gtc_output]) === undefined) {
            currentOutput = output[req.body.gtc_output] = new GTCOutput(
                GTC_outputDir
            );
            const outputKeys = Object.keys(output);
            delete output[outputKeys[outputKeys.length - processLimit - 1]];
            console.log(`path set to ${GTC_outputDir}`);
            await currentOutput.getSnapshotFileList();
            await currentOutput.check_tracking();
        }
        currentOutput.fileList = (await readdir(currentOutput.dir, 'utf-8'))
            .map(filename => filename.toLowerCase())
            .filter(filename => filename.endsWith('.out'));

        const plotTypes = [...Object.keys(GTCOutput.index), 'Summary'];
        res.send(
            pug.renderFile(pugView('plot'), {
                outputTag: req.body.gtc_output,
                dir: GTC_outputDir,
                types: currentOutput.particleTrackingExist
                    ? plotTypes
                    : plotTypes.filter(e => e !== 'Tracking'),
                snapFiles: currentOutput.snapshotFiles,
                fileList: currentOutput.fileList,
            })
        );
    })
);

app.use('/plot', (req, res, next) => {
    req.body.gtcOutput = output[encodeURI(req.query.dir)];
    if (req.body.gtcOutput) {
        next();
    } else {
        // requested GTFOutput instance being deleted from memory already
        res.status(404).send(
            'The GTC folder you requested has been closed due to server resource limit.'
        );
    }
});

// router for user checking one tab, the server will read corresponding files
app.get(
    '/plot/plotType/:type',
    wrap(async (req, res) => {
        let type = req.params.type;
        const currentOutput = req.body.gtcOutput;
        try {
            await currentOutput.readData(type);
            type = type.startsWith('snap') ? 'Snapshot' : type;
            const data = currentOutput.data[type];

            const status = {
                info: `${type} file read`,
                id: data.plotTypes,
            };
            if (!data.isCompleted) {
                status.warn =
                    `${path.basename(
                        data.path
                    )} is not completed. It should have ` +
                    `${data.expectedStepNumber} steps, but only contains ${data.stepNumber} step.`;
            }
            if (type === 'Snapshot') {
                status.info = `Currently selection of Snapshot file: ${path.basename(
                    data.path
                )}`;
            }
            res.send(JSON.stringify(status));
        } catch (err) {
            console.log(err);
            res.json({
                err: `Error happens when reading <b>${type}</b> file, this folder may be corrupted!`,
            });
        }
    })
);

app.get('/plot/Summary', (req, res) => {
    prepareSummaryData(req.body.gtcOutput).then(res.json.bind(res));
});

app.get('/plot/data/basicParameters', (req, res) => {
    const gtcOutput = req.body.gtcOutput;
    gtcOutput.read_para().then(() => {
        res.json(gtcOutput.parameters);
    });
});

app.get('/plot/data/:type-:id', (req, res) => {
    let plotType = req.params.type;
    let plotId = req.params.id;
    console.log(plotId);

    try {
        res.json(req.body.gtcOutput.getPlotData(plotType, plotId));
    } catch (e) {
        console.log(e);
        res.status(404).end();
    }
});

app.post('/plot/data/download', (req, res, next) => {
    const currentDir = req.body.gtcOutput.dir;
    const tarFilePath = path.join(
        tmpdir(),
        path.basename(currentDir) + '.tar.gz'
    );
    const fileList =
        'all' in req.query
            ? req.body.gtcOutput.fileList
            : req.body['file-list'];
    if (fileList === undefined) {
        return;
    }

    if (!Array.isArray(fileList)) {
        res.set({
            'Content-Disposition': `attachment; filename="${fileList}"`,
            'Content-Type': 'text/plain',
        }).sendFile(path.join(currentDir, fileList));
        return;
    }

    // multiple files need to be packed before send to client
    const ps = spawn('tar', [
        '-caf',
        tarFilePath,
        '-C',
        path.dirname(currentDir),
        ...fileList.map(filename =>
            path.join(path.basename(currentDir), filename)
        ),
    ]);
    ps.on('close', code => {
        if (code !== 0) {
            console.error(`Tar failed with exit code = ${code}`);
            return;
        }
        res.set({
            'Content-Disposition': `attachment; filename="${path.basename(
                tarFilePath
            )}"`,
            'Content-Type': 'application/gzip',
        }).sendFile(tarFilePath, err => {
            if (err) {
                next(err);
            } else {
                unlink(tarFilePath).catch(err => {
                    next(err);
                });
                console.log(
                    `${req.ip} has just downloaded files from ${currentDir}:`
                );
                console.group();
                console.table(
                    fileList.map(filename => ({ filename: filename }))
                );
                console.groupEnd();
            }
        });
    });
});

app.post('/input/download', (req, res) => {
    res.set({
        'Content-Disposition': 'attachment; filename="gtc.in"',
        'Content-Type': 'text/plain',
    });
    res.send(generateInput(req.body));
});

// error logging
app.use((err, req, res, next) => {
    res.status(500).end();
    console.error(err);
});

async function getFolderStructure(dir) {
    const fileTree = await FileTree.readFileTree(dir);
    // find out all gtc.out, and their parent folder should be gtc output folder
    const index = [];
    const filtered = fileTree.filter('gtc.out', pathArr => {
        const [file, ...folders] = pathArr;
        index.push({
            folder: folders[0],
            filePath: path.join(...folders.reverse().map(f => f.dirname), file),
        });
        return file;
    });

    await Promise.all(
        index.map(async f => {
            const { folder, filePath } = f;
            pos = path.dirname(dir) === dir ? '' : path.dirname(dir);
            const stat = await fs.stat(path.join(pos, filePath));
            folder.mTimeMs = stat.mtimeMs;
            folder.path = path.dirname(filePath);
        })
    );
    console.log(`${host_dir} scanned, ${index.length} gtc output data found.`);
    return filtered.toHTML2();
}

function generateInput(params) {
    const namelist_grouping = new Map();

    for (const [variable, value] of Object.entries(params)) {
        const [group, name] = variable.split('-');
        const filtered_value = value.replace(/[, ]+/g, ' ');

        let arr;
        if (!(arr = namelist_grouping.get(group))) {
            namelist_grouping.set(group, (arr = []));
        }
        arr.push(`${name}=${filtered_value}\n`);
    }

    let result = '';
    for (const [group_name, group_vars] of namelist_grouping) {
        result += `&${group_name}\n${group_vars.join('')}/\n`;
    }

    return result;
}

async function validateInputSchema() {
    const ajv = new Ajv();

    const input_specs = await Promise.all(
        (await fs.readdir('./public/javascripts/'))
            .filter(filename => filename.endsWith('.json'))
            .map(filename =>
                fs
                    .readFile(
                        path.join('./public/javascripts/', filename),
                        'utf-8'
                    )
                    .then(str => JSON.parse(str))
            )
    );

    const validate = ajv.compile(input_schema);
    const valid = input_specs.every(input_spec => validate(input_spec));
    if (valid) {
        console.log('Input specs are valid.');
    } else {
        console.log(validate.errors);
    }
}

async function prepareSummaryData(currentOutput) {
    await currentOutput.readData('Equilibrium');
    const data = {};
    [
        'rg',
        'q',
        'dlnq_dpsi',
        'Te',
        'dlnTe_dpsi',
        'ne',
        'dlnne_dpsi',
        'Ti',
        'dlnTi_dpsi',
        'ni',
        'dlnni_dpsi',
        'Tf',
        'dlnTf_dpsi',
        'nf',
        'dlnnf_dpsi',
    ].forEach(key => {
        data[key] = currentOutput.data['Equilibrium'].radialData[key];
    });
    return data;
}
