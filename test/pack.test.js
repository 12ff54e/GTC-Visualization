const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { promisify } = require('node:util');
const { gunzipSync } = require('node:zlib');
const { pack, fileList } = require('../util/pack.js');

const execFileAsync = promisify(execFile);
const directories = new Set([
    'public/fonts', 'public/input', 'public/javascripts', 'public/libs',
    'public/shader', 'public/stylesheets', 'views',
]);

async function setTreeMode(target, readonly) {
    const stat = await fs.lstat(target);
    if (!readonly) await fs.chmod(target, stat.isDirectory() ? 0o755 : 0o644);
    if (stat.isDirectory()) {
        for (const name of await fs.readdir(target)) {
            await setTreeMode(path.join(target, name), readonly);
        }
    }
    if (readonly) await fs.chmod(target, stat.isDirectory() ? 0o555 : 0o444);
}

async function fixture(t) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gtc-pack-test-'));
    t.after(async () => {
        await setTreeMode(root, false);
        await fs.rm(root, { recursive: true, force: true });
    });
    const source = path.join(root, 'checkout-with-any-name');
    for (const filename of fileList) {
        const file = path.join(source, filename, ...(directories.has(filename) ? ['sample.txt'] : []));
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, `fixture for ${filename}\n`);
    }
    await fs.mkdir(path.join(source, 'public/libs/ffte'), { recursive: true });
    await fs.writeFile(path.join(source, 'public/libs/ffte/ffte.js'), 'nested asset\n');
    await setTreeMode(source, true);
    return { root, source, archive: path.join(root, 'release.tar.gz') };
}

function headers(archive) {
    const data = gunzipSync(archive);
    const entries = [];
    for (let offset = 0; offset + 512 <= data.length;) {
        const header = data.subarray(offset, offset + 512);
        if (header.every(byte => byte === 0)) break;
        const field = (start, end) => header.subarray(start, end).toString().split('\0')[0];
        const size = parseInt(field(124, 136), 8) || 0;
        entries.push({
            name: [field(345, 500), field(0, 100)].filter(Boolean).join('/'),
            mode: parseInt(field(100, 108), 8),
            type: field(156, 157),
            magic: field(257, 263),
        });
        offset += 512 + Math.ceil(size / 512) * 512;
    }
    return entries;
}

test('release from read-only sources has writable directories and no platform metadata', async t => {
    const { root, source, archive } = await fixture(t);
    const originalMode = (await fs.stat(path.join(source, 'views'))).mode;
    await pack(source, archive);
    const entries = headers(await fs.readFile(archive));
    assert.ok(entries.length > fileList.length);
    for (const entry of entries) {
        assert.equal(entry.magic, 'ustar', entry.name);
        assert.ok(['0', '', '5'].includes(entry.type), `Unexpected extended header: ${entry.name}`);
        assert.ok(entry.mode & 0o200, `Owner cannot write ${entry.name}`);
        if (entry.type === '5') {
            assert.ok(entry.mode & 0o100, `Owner cannot enter ${entry.name}`);
        } else {
            assert.equal(entry.mode & 0o111, 0, `Asset unexpectedly executable: ${entry.name}`);
        }
    }
    assert.ok(entries.some(entry => entry.name === 'GTC-Visualization/views/'));
    assert.equal((await fs.stat(path.join(source, 'views'))).mode, originalMode);
    const destination = path.join(root, 'unpacked');
    await fs.mkdir(destination);
    const { stderr } = await execFileAsync('tar', ['-xf', archive, '-C', destination]);
    assert.equal(stderr, '');
    const output = path.join(destination, 'GTC-Visualization');
    assert.equal(await fs.readFile(path.join(output, 'public/libs/ffte/ffte.js'), 'utf8'), 'nested asset\n');
    await fs.writeFile(path.join(output, 'views/new.pug'), 'writable after extraction\n');
});

test('a missing required asset fails packaging instead of producing an incomplete release', async t => {
    const { source, archive } = await fixture(t);
    await setTreeMode(source, false);
    await fs.unlink(path.join(source, 'server-prod.js'));
    await assert.rejects(pack(source, archive), { code: 'ENOENT' });
    await assert.rejects(fs.access(archive), { code: 'ENOENT' });
});
