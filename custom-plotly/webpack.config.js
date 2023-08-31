// HACK: OpenSSL 3 does not support md4 any more, but webpack hardcodes it all over the place: https://github.com/webpack/webpack/issues/13572
const crypto = require('crypto');
const crypto_orig_createHash = crypto.createHash;
crypto.createHash = algorithm =>
    crypto_orig_createHash(algorithm == 'md4' ? 'sha256' : algorithm);

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
        ],
    },
};
