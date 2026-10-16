const { spawn } = require('child_process');
const { once } = require('events');
const { cp, mkdtemp, mkdir, rm } = require('fs/promises');
const { tmpdir } = require('os');
const path = require('path');

const packName = 'GTC-Visualization.tar.gz';
const fileList = [
    'public/fonts',
    'public/input',
    'public/javascripts',
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
    const stagingRoot = await mkdtemp(
        path.join(tmpdir(), 'gtc-visualization-pack-')
    );
    const packageRoot = path.join(stagingRoot, 'GTC-Visualization');

    try {
        await mkdir(packageRoot);
        for (const filename of fileList) {
            await cp(
                path.join(process.cwd(), filename),
                path.join(packageRoot, filename),
                { recursive: true }
            );
        }

        const tar = spawn(
            'tar',
            [
                '-caf',
                path.join(process.cwd(), packName),
                '-C',
                stagingRoot,
                'GTC-Visualization',
            ],
            { stdio: 'inherit' }
        );
        const [code] = await once(tar, 'close');
        if (code !== 0) {
            throw new Error(`tar exited with code ${code}`);
        }
    } finally {
        await rm(stagingRoot, { recursive: true, force: true });
    }
}

pack()
    .then(() => {
        console.log(`Files are packed into ${packName}`);
    })
    .catch(err => {
        console.error(err);
        process.exitCode = 1;
    });
