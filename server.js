const express = require('express');
require('dotenv').config();
const GTCOutput = require('./GTC-output-parser/main.js');

const app = express();
const port = process.env.PORT || 3000;

let output;

app.use(express.static('./public'));
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'pug');

app.listen(port);

// client post the requested gtc output dir
app.post('/', async (req, res) => {
    GTC_outputDir = req.body.dir;
    output = new GTCOutput(GTC_outputDir);
    console.log(`path set to ${GTC_outputDir}`);

    await output.getSnapshotFileList()
    res.render('plot', {
        dir: GTC_outputDir,
        types: Object.keys(GTCOutput.index),
        snapFiles: output.snapshotFiles });
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
