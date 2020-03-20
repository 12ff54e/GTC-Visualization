const express = require('express');
require('dotenv').config();
const GTCOutput = require('./GTC-output-parser/main.js');
const path = require('path');
const compression = require('compression');

const app = express();
const port = process.env.PORT || 3000;

let output;

app.use(compression());
app.use(express.static('./public'));
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'pug');

app.listen(port);

// client post the requested gtc output dir
app.post('/', async (req, res) => {
    try {
        GTC_outputDir = req.body.dir;
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
})

// router for user checking one tab, the server will read corresponding files
app.get('/plotType/:type', async (req, res) => {
    try {
        let type = req.params.type;
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
