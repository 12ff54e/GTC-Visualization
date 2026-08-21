const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const publicDirectoryUrl = pathToFileURL(
    `${path.join(__dirname, '..', 'public')}${path.sep}`
).href;

function referenceComplexDft(reals, imaginaries) {
    const output = new Float64Array(reals.length * 2);
    for (let frequency = 0; frequency < reals.length; frequency++) {
        for (let position = 0; position < reals.length; position++) {
            const angle =
                (-2 * Math.PI * frequency * position) / reals.length;
            const cosine = Math.cos(angle);
            const sine = Math.sin(angle);
            output[2 * frequency] +=
                reals[position] * cosine - imaginaries[position] * sine;
            output[2 * frequency + 1] +=
                reals[position] * sine + imaginaries[position] * cosine;
        }
    }
    return output;
}

function assertClose(actual, expected, tolerance = 2e-9) {
    assert.equal(actual.length, expected.length);
    for (let index = 0; index < actual.length; index++) {
        assert.ok(
            Math.abs(actual[index] - expected[index]) < tolerance,
            `index ${index}: expected ${expected[index]}, got ${actual[index]}`
        );
    }
}

test('client FFTE adapter computes arbitrary-length real FFTs', async () => {
    global.document = { baseURI: publicDirectoryUrl };
    const { getFFT } = await import('../client/shared/fft.js');
    const fft = await getFFT();
    const input = Float64Array.from(
        { length: 11 },
        (_, index) => Math.sin(index * 0.37) + index * 0.02
    );
    const actual = fft.r2c1d(input);
    const expected = referenceComplexDft(
        input,
        new Float64Array(input.length)
    ).slice(0, 2 * (Math.floor(input.length / 2) + 1));
    assertClose(actual, expected);
});

test('client FFTE adapter batches contiguous real transforms', async () => {
    global.document = { baseURI: publicDirectoryUrl };
    const { getFFT } = await import('../client/shared/fft.js');
    const fft = await getFFT();
    const length = 7;
    const batchCount = 4;
    const input = Float64Array.from(
        { length: length * batchCount },
        (_, index) => Math.sin(index * 0.31) + index * 0.003
    );
    const actual = fft.r2c1dBatch(input, length);
    const outputStride = 2 * (Math.floor(length / 2) + 1);

    for (let batch = 0; batch < batchCount; batch++) {
        const expected = fft.r2c1d(
            input.slice(batch * length, (batch + 1) * length)
        );
        assertClose(
            actual.slice(batch * outputStride, (batch + 1) * outputStride),
            expected
        );
    }
});

test('client FFTE adapter C2C transform matches a direct DFT', async () => {
    global.document = { baseURI: publicDirectoryUrl };
    const { getFFT } = await import('../client/shared/fft.js');
    const reals = Float64Array.from(
        { length: 13 },
        (_, index) => Math.cos(index * 0.21) + index * 0.01
    );
    const imaginaries = Float64Array.from(
        { length: 13 },
        (_, index) => Math.sin(index * 0.43) - index * 0.015
    );
    const input = new Float64Array(reals.length * 2);
    for (let index = 0; index < reals.length; index++) {
        input[index * 2] = reals[index];
        input[index * 2 + 1] = imaginaries[index];
    }
    const fft = await getFFT();
    assertClose(fft.c2c1d(input), referenceComplexDft(reals, imaginaries));
});
