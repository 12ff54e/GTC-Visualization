// HACK: OpenSSL 3 does not support md4 any more, but webpack hardcodes it all over the place: https://github.com/webpack/webpack/issues/13572
const crypto = require('crypto');
const crypto_orig_createHash = crypto.createHash;
crypto.createHash = algorithm =>
    crypto_orig_createHash(algorithm == 'md4' ? 'sha256' : algorithm);
const path = require('path');

module.exports = [
    {
        mode: 'production',
        entry: './server/GTC-output-parser/main.js',
        target: 'webworker',
        watch: true,
        watchOptions: {
            aggregateTimeout: 500,
            poll: 1200,
        },
        output: {
            library: 'GTCOutput',
            libraryTarget: 'var',
            path: path.join(__dirname, '..', '..', 'public', 'javascripts'),
            filename: 'gtc-output-parser.min.js',
        },
    },
];
