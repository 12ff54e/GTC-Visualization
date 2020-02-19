const express = require('express');
require('dotenv').config();
const path = require('path');
const GTCOutput = require('./GTC-output-parser/main.js');

const app = express();
const port = process.env.PORT || 3000;
let GTC_outputDir = 'C:\\Users\\zq\\OneDrive\\mgui_161111\\4He2\\maxwell\\m30'

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

    await output.getSnapshotList()
    res.render('plot', { dir: GTC_outputDir, snapFiles: output.snapshotFiles });
})

// router for user checking one tab, the server will read corresponding files
app.get('/plotType/:type', async (req, res, next) => {
    switch (req.params.type) {
        case 'History':
            await output.history();
            res.send(JSON.stringify({
                info: 'history file read',
                id: output.historyData.plotTypes
            }));
            break;
        case 'Equilibrium':
            await output.equilibrium();
            res.send(JSON.stringify({
                info: 'equilibrium file read',
                id: output.equilibriumData.plotTypes
            }))
            break;
        case 'RadialTime':
            await output.radialTime();
            res.send(JSON.stringify({
                info: 'radialTime file read',
                id: output.radialTimeData.plotTypes
            }))
            break;
        default:
            next();
    }
}, async (req, res) => {
    let snapshotFile = req.params.type;
    await output.snapshot(snapshotFile);
    res.send(JSON.stringify({
        info: `${snapshotFile} read`,
        id: output.snapshotData.plotTypes
    }))
})

app.get('/data/basicParameters', (req, res) => {
    res.send(JSON.stringify(output.parameters));
})

// TODO: use some compression scheme to speed up transmission
app.get('/data/:type-:id', (req, res, next) => {
    let requestPlotId = req.params.id;
    console.log(requestPlotId);
    if (requestPlotId === 'test') {
        res.send(JSON.stringify([{
            data: [{ x: [1, 2, 3, 4], y: [1, 4, 9, 16] }],
            layout: { xaxis: { title: 'x' }, yaxis: { title: 'y' } }
        }]))
    } else {
        next();
    }
}, (req, res, next) => {
    let requestPlotType = req.params.type;
    let requestPlotId = req.params.id;
    switch (requestPlotType) {
        case 'History':
            res.send(JSON.stringify(
                output.historyData.plotData(requestPlotId, output.parameters)));
            break;
        case 'Equilibrium':
            res.send(JSON.stringify(
                output.equilibriumData.plotData(requestPlotId)
            ))
            break;
        case 'Snapshot':
            res.send(JSON.stringify(
                output.snapshotData.plotData(requestPlotId)
            ))
            break;
        case 'RadialTime':
            res.send(JSON.stringify(
                output.radialTimeData.plotData(requestPlotId)
            ))
            break;
    }
})
