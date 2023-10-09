const { spawn } = require('child_process');
const { once } = require('events');
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

async function pack() {
    const tar = spawn(
        'tar',
        [
            '-caf',
            packName,
            '-C',
            path.dirname(process.cwd()),
            ...fileList.map(filename =>
                path.join('GTC-Visualization', filename)
            ),
        ],
        { stdio: 'inherit' }
    ).on('error', () => {
        console.error('Failed to execute tar!');
    });

    await once(tar, 'close');
}

pack()
    .then(() => {
        console.log(`Files are packed into ${packName}`);
    })
    .catch(err => {
        console.error(err);
    });
