// HACK: OpenSSL 3 does not support md4 any more, but webpack hardcodes it all over the place: https://github.com/webpack/webpack/issues/13572
const crypto = require('crypto');
const crypto_orig_createHash = crypto.createHash;
crypto.createHash = algorithm =>
    crypto_orig_createHash(algorithm == 'md4' ? 'sha256' : algorithm);
const path = require('path');

module.exports = [
    {
        mode: 'production',
        entry: './server/server.js',
        target: 'node',
        externals: {
            gtcOutputParser: { commonjs: './GTC-output-parser/main.js' },
        },
        output: {
            path: __dirname,
            filename: 'server-prod.js',
        },
        node: {
            __dirname: false,
            __filename: false,
        },
    },
];
