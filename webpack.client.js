const path = require('path');

module.exports = {
    mode: 'production',
    entry: './public/javascripts/index.js',
    target: 'web',
    output: {
        path: path.join(__dirname, 'public/javascripts'),
        filename: 'bundle.js',
    },
    externals: {
        // Provided by separate <script> tags in plot.pug:
        //   plotly-custom.min.js  →  window.Plotly
        //   libs/fftw-js/bundle.js →  window.fftw
        Plotly: 'Plotly',
        fftw: 'fftw',
    },
    module: {
        rules: [
            {
                // JSON parameter specs imported by gtc-input/input-generate.js
                test: /\.json$/,
                type: 'json',
            },
        ],
    },
    performance: {
        hints: false,
    },
};
