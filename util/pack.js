const { spawn } = require('child_process');
const { once } = require('events');
const path = require('path');

const packName = 'GTC-Visualization.tar.gz';
const fileList = [
    'public/fonts',
    'public/input',
    'public/javascripts/components/gtc-output-picker.js',
    'public/javascripts/gtc-input',
    'public/javascripts/bundle.js',
    'public/libs',
    'public/shader',
    'public/stylesheets',
    'public/favicon.ico',
    'public/loading.gif',
    'views',
    '.env_example',
    'LICENSE',
    'package.json',
    'README.md',
    'server-prod.js',
    'server-prod.js.LICENSE.txt',
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
