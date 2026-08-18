/**
 * Real-data integration tests for POST /plot/data/batch.
 *
 * These tests intentionally use the archived GTC runs in test/data. Only the
 * files needed by the requested plot types are extracted, keeping setup fast
 * and avoiding a permanent copy of the simulation output in the worktree.
 *
 * Run with:
 *   npm run test:batch:real
 */

'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { batchPlotData } = require('../server/batch-data-handler.js');
const GTCOutput = require('../server/GTC-output-parser/main.js');

const execFileAsync = promisify(execFile);
const DATA_DIR = path.join(__dirname, 'data');
const REQUIRED_OUTPUT_FILES = [
    'gtc.out',
    'history.out',
    'equilibrium.out',
    'data1d.out',
];

const fixtures = [
    {
        name: 'ITG',
        archive: 'gtc-itg.tar.gz',
        archiveRoot: 'ITG',
        expected: {
            historySteps: 1000,
            equilibriumPoints: 129,
            radialTimeSteps: 1000,
            radialTimePoints: 97,
        },
    },
    {
        name: 'ITPA-TAE',
        archive: 'gtc-tae.tar.gz',
        archiveRoot: 'ITPA-TAE',
        expected: {
            historySteps: 1000,
            equilibriumPoints: 500,
            radialTimeSteps: 1000,
            radialTimePoints: 101,
        },
    },
];

let extractionRoot;

function createResponseRecorder() {
    return {
        statusCode: 200,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

async function extractFixture(fixture) {
    const archivePath = path.join(DATA_DIR, fixture.archive);
    try {
        await fs.access(archivePath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            fixture.missing = true;
            return;
        }
        throw error;
    }

    await execFileAsync('tar', [
        '-xzf',
        archivePath,
        '-C',
        extractionRoot,
        ...REQUIRED_OUTPUT_FILES.map(
            filename => `${fixture.archiveRoot}/${filename}`
        ),
    ]);

    fixture.outputDir = path.join(extractionRoot, fixture.archiveRoot);
}

async function requestRealBatch(outputDir, requests) {
    const res = createResponseRecorder();
    const req = {
        body: {
            gtcOutput: new GTCOutput(outputDir),
            requests,
        },
        query: {},
    };

    await batchPlotData(req, res);
    return res;
}

async function requestLegacyPlotData(outputDir, requests, query = {}) {
    const gtcOutput = new GTCOutput(outputDir);
    const figures = [];

    for (const { type, id } of requests) {
        await gtcOutput.readData(type);
        figures.push(gtcOutput.getPlotData(type, id, query));
    }

    return figures;
}

function toWireValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function assertFiniteSeries(values, label) {
    assert.ok(Array.isArray(values), `${label} should be an array`);
    assert.ok(values.length > 1, `${label} should contain real data`);
    assert.ok(
        values.every(Number.isFinite),
        `${label} should contain only finite numbers`
    );
}

before(async () => {
    extractionRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gtc-batch-api-'));
    await Promise.all(fixtures.map(extractFixture));
});

after(async () => {
    if (extractionRoot) {
        await fs.rm(extractionRoot, { recursive: true, force: true });
    }
});

describe('POST /plot/data/batch with real GTC output', () => {
    for (const fixture of fixtures) {
        it(`parses and returns a mixed batch for ${fixture.name}`, async t => {
            if (fixture.missing) {
                t.skip(`missing test/data/${fixture.archive}`);
                return;
            }

            const requests = [
                { type: 'History', id: 'phi-point' },
                { type: 'Equilibrium', id: '1D-minor-q' },
                { type: 'RadialTime', id: 'phi-zonal' },
                { type: 'Summary', id: 'all' },
            ];

            const res = await requestRealBatch(fixture.outputDir, requests);

            // The old /plot/data/:typeid route reads the requested type and
            // then calls getPlotData(). Use a separate parser instance so the
            // comparison cannot pass because it reused the batch cache.
            const legacyRequests = requests.filter(
                ({ type }) => type !== 'Summary'
            );
            const legacyFigures = await requestLegacyPlotData(
                fixture.outputDir,
                legacyRequests
            );

            assert.equal(res.statusCode, 200);
            assert.deepEqual(
                res.body.results.map(({ type, id }) => ({ type, id })),
                requests,
                'results should preserve request order'
            );
            for (const result of res.body.results) {
                assert.equal(
                    result.error,
                    undefined,
                    `${result.type}-${result.id} failed: ${result.error}`
                );
            }

            legacyRequests.forEach((request, index) => {
                const batchResult = res.body.results.find(
                    result =>
                        result.type === request.type && result.id === request.id
                );
                assert.deepEqual(
                    toWireValue(batchResult.figures),
                    toWireValue(legacyFigures[index]),
                    `${request.type}-${request.id} should match the legacy data API`
                );
            });

            const history = res.body.results[0].figures;
            assert.equal(history.length, 2);
            assertFiniteSeries(history[0].data[0].x, 'History x values');
            assertFiniteSeries(history[0].data[0].y, 'History y values');
            assert.equal(
                history[0].data[0].x.length,
                history[0].data[0].y.length
            );
            assert.equal(
                history[0].data[0].y.length,
                fixture.expected.historySteps
            );

            const equilibriumTrace = res.body.results[1].figures[0].data[0];
            assertFiniteSeries(equilibriumTrace.x, 'Equilibrium minor radius');
            assertFiniteSeries(equilibriumTrace.y, 'Equilibrium safety factor');
            assert.equal(equilibriumTrace.x.length, equilibriumTrace.y.length);
            assert.equal(
                equilibriumTrace.x.length,
                fixture.expected.equilibriumPoints
            );

            const radialTimeTrace = res.body.results[2].figures[0].data[0];
            assert.equal(radialTimeTrace.type, 'heatmap');
            assert.equal(
                radialTimeTrace.z.length,
                fixture.expected.radialTimeSteps
            );
            assertFiniteSeries(radialTimeTrace.z[0], 'Radial-time first step');
            assert.equal(
                radialTimeTrace.z[0].length,
                fixture.expected.radialTimePoints
            );

            const summary = res.body.results[3].figures;
            assertFiniteSeries(summary.minor, 'Summary minor radius');
            assertFiniteSeries(summary.q, 'Summary safety factor');
            assert.deepEqual(summary.minor, equilibriumTrace.x);

            // Express must be able to serialize the complete response body.
            assert.doesNotThrow(() => JSON.stringify(res.body));
        });
    }
});
