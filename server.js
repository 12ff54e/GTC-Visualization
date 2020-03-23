const express = require('express');
require('dotenv').config();
const GTCOutput = require('./GTC-output-parser/main.js');
const FileTree = require('./FileTree.js');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const host_dir = process.env.HOST_DIR || require('os').homedir();

let output;

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
    GTC_outputDir = path.join(
        path.basename(host_dir) ? path.dirname(host_dir) : host_dir,
        decodeURI(req.body.gtc_output));
    output = new GTCOutput(GTC_outputDir);
    console.log(`path set to ${GTC_outputDir}`);

    await output.getSnapshotFileList();
    res.render('plot', {
        dir: GTC_outputDir,
        types: Object.keys(GTCOutput.index),
        snapFiles: output.snapshotFiles
    });
})

// router for user checking one tab, the server will read corresponding files
app.get('/plotType/:type', async (req, res, next) => {
    let type = req.params.type;
    await output.readData(type);
    type = type.startsWith('snap') ? 'Snapshot' : type;
    res.send(JSON.stringify({
        info: `${type} file read`,
        id: output.data[type].plotTypes
    }))
})

app.get('/data/basicParameters', (req, res) => {
    res.send(JSON.stringify(output.parameters));
})

// TODO: use some compression scheme to speed up transmission
app.get('/data/:type-:id', (req, res) => {
    let requestPlotType = req.params.type;
    let requestPlotId = req.params.id;
    console.log(requestPlotId)
    res.send(JSON.stringify(
        output.data[requestPlotType].plotData(requestPlotId, output.parameters),
    ))
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
