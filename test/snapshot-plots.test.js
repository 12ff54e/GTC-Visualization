const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const Snapshot = require('../server/GTC-output-parser/snapshot.js');

const publicDirectoryUrl = pathToFileURL(
    path.join(__dirname, '..', 'public') + path.sep
).href;

async function loadClientSnapshot() {
    global.window = {};
    global.document = { baseURI: publicDirectoryUrl };
    return Promise.all([
        import('../client/plotting/snapshot.js'),
        import('../client/control/state.js'),
    ]);
}

function createSnapshot() {
    const snapshot = new Snapshot('snapshot.out', {
        iload: 1,
        nhybrid: 0,
        fload: 0,
        feload: 0,
    });
    snapshot.fieldData.fluxData = {
        phi: [
            [1, 2, 3],
            [4, 5, 6],
        ],
    };
    return snapshot;
}

test('flux-surface plot includes the physical 2D spectrum second', () => {
    const figures = createSnapshot().plotData('phi-flux', null, {});

    assert.equal(figures.length, 3);
    assert.equal(figures[0].data[0].type, 'heatmap');
    assert.equal(figures[0].data[0].colorscale, 'RdBu');
    assert.equal(figures[0].data[0].reversescale, true);
    assert.equal(figures[0].data[0].zmid, 0);
    assert.equal(figures[1].data[0].type, 'heatmap');
    assert.equal(figures[1].data[0].colorscale, 'Picnic');
    assert.equal(figures[1].data[0].zmid, 0);
    assert.match(figures[1].layout.title.text, /theta.*zeta/);
    assert.deepEqual(figures[2].extraData, [
        [1, 2, 3],
        [4, 5, 6],
    ]);
});

test('spectrum plot retains both original 1D spectra', () => {
    const figures = createSnapshot().plotData('phi-spectrum', null, {});

    assert.equal(figures.length, 3);
    assert.equal(figures[0].data[0].type, 'scatter');
    assert.equal(figures[1].data[0].type, 'scatter');
    assert.match(figures[0].layout.title.text, /poloidal/);
    assert.match(figures[1].layout.title.text, /parallel/);
    assert.ok(figures[2].extraData);
});

test('client fills the second flux figure with the 2D spectrum', async () => {
    const [{ snapshotFluxSurfaceSpectrum }, { default: state }] =
        await loadClientSnapshot();
    const field = Array.from({ length: 12 }, (_, zeta) =>
        Array.from({ length: 16 }, (_, theta) =>
            Math.cos((2 * Math.PI * theta) / 16 - (4 * Math.PI * zeta) / 12)
        )
    );
    const fluxTrace = { type: 'heatmap', z: field };
    const figures = [
        { data: [fluxTrace], layout: { title: { text: 'flux surface' } } },
        { data: [{ type: 'heatmap' }], layout: { title: { text: 'spectrum' } } },
        { extraData: field },
    ];
    state.basicParameters = {
        radial_region: [0, 1],
        diag_flux: 5,
        mpsi: 10,
        toroidaln: 1,
    };

    await snapshotFluxSurfaceSpectrum(
        figures,
        { x: [0, 1], y: [2, 2] }
    );

    assert.equal(figures.length, 2);
    assert.equal(figures[0].data[0], fluxTrace);
    assert.ok(figures[1].data[0].z.length > 0);
    assert.match(figures[1].layout.title.text, /q=2/);
});

test('client still computes both original 1D spectra', async () => {
    const [{ snapshotSpectrum }] = await loadClientSnapshot();
    const field = Array.from({ length: 10 }, (_, zeta) =>
        Array.from({ length: 10 }, (_, theta) =>
            Math.cos((2 * Math.PI * theta) / 10) +
            Math.sin((2 * Math.PI * zeta) / 10)
        )
    );
    const figures = [
        { data: [{}], layout: {} },
        { data: [{}], layout: {} },
        { extraData: field },
    ];

    await snapshotSpectrum(figures);

    assert.equal(figures.length, 2);
    assert.deepEqual(figures[0].data[0].x, [0, 1]);
    assert.deepEqual(figures[1].data[0].x, [0, 1]);
    assert.equal(figures[0].data[0].y.length, 2);
    assert.equal(figures[1].data[0].y.length, 2);
});
