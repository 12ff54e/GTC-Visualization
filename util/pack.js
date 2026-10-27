const { spawn } = require('child_process');
const { once } = require('events');
const { chmod, cp, lstat, mkdtemp, mkdir, readdir, rm } = require('fs/promises');
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

async function normalizePermissions(target) {
    const stat = await lstat(target);
    // Do not chmod a symlink's target outside the staging directory.
    if (stat.isSymbolicLink()) return;
    await chmod(target, stat.isDirectory() ? 0o755 : 0o644);
    if (stat.isDirectory()) {
        for (const entry of await readdir(target)) {
            await normalizePermissions(path.join(target, entry));
        }
    }
}

async function pack(
    sourceRoot = process.cwd(),
    archivePath = path.join(sourceRoot, packName)
) {
    const stagingRoot = await mkdtemp(
        path.join(tmpdir(), 'gtc-visualization-pack-')
    );
    const packageRoot = path.join(stagingRoot, 'GTC-Visualization');

    try {
        // Keep a stable archive root name regardless of the checkout folder.
        // Normalize permissions on this isolated copy so read-only source
        // attributes never leak into the release or get changed in-place.
        await mkdir(packageRoot);
        for (const filename of fileList) {
            await cp(
                path.join(sourceRoot, filename),
                path.join(packageRoot, filename),
                { recursive: true }
            );
        }
        // Windows bsdtar can archive read-only directories as mode 0555. Such
        // directories can prevent Linux tar from extracting later members or
        // overwriting an existing release. Clear read-only flags on the staged
        // copy only; use 0755 for directories and 0644 for files. Windows chmod
        // supports only the corresponding writable/read-only attributes, while
        // POSIX systems also apply these mode bits (subject to extraction umask).
        await normalizePermissions(packageRoot);

        // POSIX ustar avoids PAX headers such as SCHILY.fflags=rdonly and the
        // platform-specific file flags, ACLs and extended attributes that cause
        // warnings or read-only directories when moving a Windows build to Linux.
        const tar = spawn(
            'tar',
            [
                '--format=ustar',
                '-czf',
                archivePath,
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

if (require.main === module) {
    pack()
        .then(() => {
            console.log(`Files are packed into ${packName}`);
        })
        .catch(err => {
            console.error(err);
            process.exitCode = 1;
        });
}

module.exports = { pack, fileList };
