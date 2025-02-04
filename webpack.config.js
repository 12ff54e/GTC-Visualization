module.exports = {
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
