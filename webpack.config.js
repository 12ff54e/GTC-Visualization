const path = require('path');

// Client bundle — plot-page JS
const client = {
    name: 'client',
    mode: 'production',
    entry: './public/javascripts/index.js',
    target: 'web',
    output: {
        path: path.join(__dirname, 'public/javascripts'),
        filename: 'bundle.js',
    },
};

// Server bundle — Express app
const server = {
    name: 'server',
    mode: 'production',
    entry: './server/server.js',
    target: 'node',
    output: {
        path: __dirname,
        filename: 'server-prod.js',
    },
    node: {
        __dirname: false,
        __filename: false,
    },
};

module.exports = [client, server];
