const express = require('express');
require('dotenv').config();
const GTCOutput = require('./GTC-output-parser/main.js');
const path = require('path');
const compression = require('compression');
const FileTree = require('./fileTree.js');
const fs = require('fs').promises;
const Ajv = require('ajv').default;
const helmet = require('helmet');

const app = express();
const port = process.env.PORT || 3000;
const host_dir = process.env.HOST_DIR || require('os').homedir();

validate_input_schema().catch((err) => {
    console.log(err);
});

let output;

app.use(compression());
app.use(express.static('./public'));
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'pug');
app.use(helmet());

app.listen(port);

app.get('/', async (req, res) => {
    const html = await getFolderStructure(path.normalize(host_dir));
    await fs.writeFile(path.join(__dirname, 'views', 'files.html'), html);
    res.render('index');
});

app.post('/', async (req, res) => {
    try {
        GTC_outputDir = path.join(
            path.basename(host_dir) ? path.dirname(host_dir) : host_dir,
            decodeURI(req.body.gtc_output)
        );
        output = new GTCOutput(GTC_outputDir);
        console.log(`path set to ${GTC_outputDir}`);

        await output.getSnapshotFileList();
        await output.check_tracking();
        const plotTypes = Object.keys(GTCOutput.index);
        res.render('plot', {
            dir: GTC_outputDir,
            types: output.particleTrackingExist
                ? plotTypes
                : plotTypes.filter((e) => e !== 'Tracking'),
            snapFiles: output.snapshotFiles,
        });
    } catch (err) {
        console.log(err);
    }
});

// router for user checking one tab, the server will read corresponding files
app.get('/plotType/:type', async (req, res) => {
    let type = req.params.type;
    try {
        await output.readData(type);
        type = type.startsWith('snap') ? 'Snapshot' : type;
        const data = output.data[type];

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
});

app.get('/data/basicParameters', (req, res) => {
    res.json(output.parameters);
});

app.get('/data/:type-:id', (req, res) => {
    let plotType = req.params.type;
    let plotId = req.params.id;
    console.log(plotId);

    try {
        res.json(output.getPlotData(plotType, plotId));
    } catch (e) {
        console.log(e);
        res.status(404).end();
    }
});

app.post('/input', (req, res) => {
    res.send('Not implement yet.');
    // fs.writeFile('./gtc.in', generate_input(req.body)).then(() => {
    //     res.redirect('/');
    // });
});

app.post('/input/download', (req, res) => {
    res.set({
        'Content-Disposition': 'attachment; filename="gtc.in"',
        'Content-Type': 'text/plain',
    });
    res.send(generate_input(req.body));
});

async function getFolderStructure(dir) {
    const fileTree = await FileTree.readFileTree(dir);
    // find out all gtc.out, and their parent folder should be gtc output folder
    const index = [];
    const filtered = fileTree.filter('gtc.out', (pathArr) => {
        const [file, ...folders] = pathArr;
        index.push({
            folder: folders[0],
            filePath: path.join(
                ...folders.reverse().map((f) => f.dirname),
                file
            ),
        });
        return file;
    });

    await Promise.all(
        index.map(async (f) => {
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

function generate_input(params) {
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

async function validate_input_schema() {
    const ajv = new Ajv();

    const schema = JSON.parse(
        await fs.readFile('./input-parameters-schema.json', 'utf-8')
    );
    const input_specs = await Promise.all(
        (await fs.readdir('./public/javascripts/'))
            .filter((filename) => filename.endsWith('.json'))
            .map((filename) =>
                fs
                    .readFile(
                        path.join('./public/javascripts/', filename),
                        'utf-8'
                    )
                    .then((str) => JSON.parse(str))
            )
    );

    const validate = ajv.compile(schema);
    const valid = input_specs.every((input_spec) => validate(input_spec));
    if (valid) {
        console.log('Input specs are valid.');
    } else {
        console.log(validate.errors);
    }
}
