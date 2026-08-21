const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const publicDirectoryUrl = pathToFileURL(
    `${path.join(__dirname, '..', 'public')}${path.sep}`
).href;

test('diagnostic safety factor is interpolated at the snapshot surface', async () => {
    const { diagnosticSafetyFactor } = await import(
        '../client/plotting/field-aligned-spectrum.js'
    );
    const result = diagnosticSafetyFactor(
        { x: [0, 0.4, 0.7, 1], y: [1, 1.8, 2.4, 3] },
        {
            radial_region: [0.2, 0.8],
            diag_flux: 50,
            mpsi: 100,
        }
    );
    assert.ok(Math.abs(result - 2) < 1e-12);
});

test('field-aligned 2D FFT recovers a physical (m, n) mode', async () => {
    global.document = { baseURI: publicDirectoryUrl };
    const [{ getFFT }, { fieldAlignedSpectrum }] = await Promise.all([
        import('../client/shared/fft.js'),
        import('../client/plotting/field-aligned-spectrum.js'),
    ]);
    const fft = await getFFT();
    const thetaCount = 16;
    const zetaCount = 12;
    const safetyFactor = 2.3;
    const toroidalN = 2;
    const expectedM = 3;
    const expectedN = 4;
    const field = Array.from({ length: zetaCount }, (_, zetaIndex) => {
        const zeta = (2 * Math.PI * zetaIndex) / (zetaCount * toroidalN);
        return Array.from({ length: thetaCount }, (_, thetaIndex) => {
            const thetaF = (2 * Math.PI * thetaIndex) / thetaCount;
            const theta = thetaF + zeta / safetyFactor;
            return Math.cos(expectedM * theta - expectedN * zeta);
        });
    });

    const spectrum = fieldAlignedSpectrum(
        field,
        safetyFactor,
        toroidalN,
        fft
    );
    let peak = { amplitude: -Infinity, m: null, n: null };
    spectrum.amplitude.forEach((row, mIndex) => {
        row.forEach((amplitude, nIndex) => {
            if (amplitude > peak.amplitude) {
                peak = {
                    amplitude,
                    m: spectrum.thetaModes[mIndex],
                    n: spectrum.toroidalModes[nIndex],
                };
            }
        });
    });

    assert.equal(peak.m, expectedM);
    assert.equal(peak.n, expectedN);
    assert.ok(Math.abs(peak.amplitude - 0.5) < 1e-10);
});
