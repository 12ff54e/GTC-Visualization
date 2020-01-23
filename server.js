const express = require('express');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('./public'));

app.listen(port);

app.get('/data/:id', (req, res) => {
    let requestPlotId = req.params.id;
    console.log(requestPlotId);
    if (requestPlotId === 'test') {
        res.send(JSON.stringify({
            data: [[1, 2], [2, 4], [3, 9], [4, 16]],
            axesLabel: ['x', 'square']
        }))
    }
})