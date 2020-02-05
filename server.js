const express = require('express');
require('dotenv').config();
const path = require('path');
const GTC_output = require('./GTC-output-parser/main.js');

const app = express();
const port = process.env.PORT || 3000;
const GTC_outputDir = 'C:\\Users\\zq\\OneDrive\\mgui_161111\\4He2\\maxwell\\m30'

let output;

app.use(express.static('./public'));

app.listen(port);

// router for user checking one tab, the server will read corresponding files
app.get('/plotType/:type', async (req, res) => {
    output = new GTC_output(GTC_outputDir);
    switch (req.params.type) {
        case 'History':
            await output.history();
            res.send(JSON.stringify({
                info: 'history file read',
                id: output.historyData.plotTypes
            }));
            break;
        case 'Equilibrium':
            break;
        case 'Snapshot':
            break;
        case 'Radial-Time':
            break;
        case 'Field-Mode':
            break;

    }
})

app.get('/data/basicParameters', (req, res) => {
    res.send(JSON.stringify(output.parameters));
})

app.get('/data/:type-:id', (req, res, next) => {
    let requestPlotId = req.params.id;
    console.log(requestPlotId);
    if (requestPlotId === 'test') {
        res.send(JSON.stringify([{
            data: [{x:[1,2,3,4],y:[1,4,9,16]}],
            layout: {xaxis:{title:'x'},yaxis:{title:'y'}}
        }]))
    } else {
        next();
    }
}, (req, res, next) => {
    let requestPlotType = req.params.type;
    let requestPlotId = req.params.id;
    switch (requestPlotType) {
        case 'hist':
            res.send(JSON.stringify(
                output.historyData.plotData(requestPlotId, output.parameters)));
            break;
        case 'eq':
            break;
        case 'snap':
            break;
        case 'rt':
            break;
        case 'fm':
            break;
    }
})
