const child_process = require('child_process');
const path = require('path');

const packName = 'GTC-Visualization.tar.gz';
const fileList = [
    'public',
    'views',
    '.env_example',
    'LICENSE',
    'package.json',
    'README.md',
    'server-prod.js',
];

child_process.spawn(
    'tar',
    [
        '-caf',
        packName,
        '-C',
        path.dirname(process.cwd()),
        ...fileList.map(filename => path.join('GTC-Visualization', filename)),
    ],
    { stdio: 'inherit' }
);
