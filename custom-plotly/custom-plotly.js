var Plotly = require('plotly.js/lib/core');

Plotly.register([
    require('plotly.js/lib/contour'),
    require('plotly.js/lib/heatmap'),
    require('plotly.js/lib/scatter3d'),
    require('plotly.js/lib/carpet'),
    require('plotly.js/lib/contourcarpet'),
    require('plotly.js/lib/scattercarpet')
])

module.exports = Plotly;