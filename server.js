const express = require('express');
require('dotenv').config();
const GTCOutput = require('./GTC-output-parser/main.js');
const path = require('path');
const compression = require('compression');
const FileTree = require('./fileTree.js');
const fs = require('fs').promises;

const app = express();
const port = process.env.PORT || 3000;
const host_dir = process.env.HOST_DIR || require('os').homedir();

let output;

app.use(compression());
app.use(express.static('./public'));
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'pug');

app.listen(port);

app.get('/', async (req, res) => {
    const html = await getFolderStructure(path.normalize(host_dir));
    await fs.writeFile(path.join(__dirname, 'views', 'files.html'), html);
    res.render('index');
})

app.post('/', async (req, res) => {
    try {
        GTC_outputDir = path.join(
            path.basename(host_dir) ? path.dirname(host_dir) : host_dir,
            decodeURI(req.body.gtc_output));
        output = new GTCOutput(GTC_outputDir);
        console.log(`path set to ${GTC_outputDir}`);

        await output.getSnapshotFileList();
        await output.check_tracking();
        const plotTypes = Object.keys(GTCOutput.index);
        res.render('plot', {
            dir: GTC_outputDir,
            types: output.particleTrackingExist ?
                plotTypes :
                plotTypes.filter(e => e !== 'Tracking'),
            snapFiles: output.snapshotFiles
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
            id: data.plotTypes
        };
        if (!data.isCompleted) {
            status.warn = `${path.basename(data.path)} is not completed. It should have ` +
                `${data.expectedStepNumber} steps, but only contains ${data.stepNumber} step.`
        }
        if (type === 'Snapshot') {
            status.info = `Currently selection of Snapshot file: ${path.basename(data.path)}`;
        }
        res.send(JSON.stringify(status));
    } catch (err) {
        console.log(err);
        res.json({ err: `Error happens when reading <b>${type}</b> file, this folder may be corrupted!` });
    }
})

app.get('/data/basicParameters', (req, res) => {
    res.json(output.parameters);
})

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
})

async function getFolderStructure(dir) {
    const fileTree = await FileTree.readFileTree(dir);
    // find out all gtc.out, and their parent folder should be gtc output folder
    const index = [];
    const filtered = fileTree.filter('gtc.out', pathArr => {
        const [file, ...folders] = pathArr;
        index.push({
            folder: folders[0],
            filePath: path.join(...folders.reverse().map(f => f.dirname), file)
        })
        return file;
    });

    await Promise.all(index.map(async f => {
        const { folder, filePath } = f;
        pos = path.dirname(dir) === dir ? '' : path.dirname(dir);
        const stat = await fs.stat(path.join(pos, filePath));
        folder.mTimeMs = stat.mtimeMs;
        folder.path = path.dirname(filePath);
    }));
    console.log(`${host_dir} scanned, ${index.length} gtc output data found.`)
    return filtered.toHTML2();
}
