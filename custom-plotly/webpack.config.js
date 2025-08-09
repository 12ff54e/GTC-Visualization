const path = require('path');

module.exports = {
    mode: 'production',
    entry: './custom-plotly/custom-plotly.js',
    output: {
        path: path.join(__dirname, '../public/javascripts'),
        filename: 'plotly-custom.min.js',
        library: 'Plotly',
        libraryTarget: 'window',
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                use: [
                    'ify-loader',
                    'transform-loader?plotly.js/tasks/compress_attributes.js',
                ],
            },
            {
                test: /\.css$/i,
                use: ['style-loader', 'css-loader'],
            },
        ],
    },
    performance: {
        hints: false, // silence the >244 KB warning if you accept the size
    },
};
