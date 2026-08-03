/**
 * Tests for the POST /plot/data/batch route handler.
 *
 * The handler function signature:
 *   async function batchPlotData(req, res)
 *
 * Run with:
 *   node --test test/batch-api.test.js
 */

'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

// ------------------------------------------------------------------
//  Mock helpers
// ------------------------------------------------------------------

/**
 * Create a mock Express response object.
 * Captures status code and JSON body so assertions can inspect them.
 */
function createMockRes() {
    const res = {
        _status: 200,
        _json: null,
        status(code) {
            res._status = code;
            return res;
        },
        json(data) {
            res._json = data;
            return res;
        },
    };
    return res;
}

/**
 * Create a mock GTCOutput instance.
 *
 * @param {Object} [opts]
 * @param {Object<string, any|Error>} [opts.readDataResults] - Map of type →
 *   return value (or Error to throw) for readData().
 * @param {Object<string, any|Error>} [opts.getPlotDataResults] - Map of
 *   "type-id" → return value (or Error to throw) for getPlotData().
 * @param {Object} [opts.radialData] - Radial data to expose as
 *   gtcOutput.data['Equilibrium'].radialData (for Summary tests).
 */
function createMockGtcOutput(opts = {}) {
    const { readDataResults, getPlotDataResults, radialData } = opts;
    const mock = {
        data: {},
        readDataCalls: [],
        getPlotDataCalls: [],
        async readData(type) {
            this.readDataCalls.push(type);
            if (readDataResults && Object.hasOwn(readDataResults, type)) {
                const val = readDataResults[type];
                if (val instanceof Error) throw val;
                return val;
            }
            // Default: succeed silently
            return undefined;
        },
        getPlotData(type, id, query) {
            this.getPlotDataCalls.push({ type, id, query });
            if (
                getPlotDataResults &&
                Object.hasOwn(getPlotDataResults, `${type}-${id}`)
            ) {
                const val = getPlotDataResults[`${type}-${id}`];
                if (val instanceof Error) throw val;
                return val;
            }
            // Default: return a simple figure
            return [
                {
                    data: [{ y: [1, 2, 3] }],
                    layout: { title: { text: `${type}-${id}` } },
                },
            ];
        },
    };

    // Wire up radialData so readData('Equilibrium') populates it
    if (radialData) {
        mock.data['Equilibrium'] = { radialData };
    }

    return mock;
}

/**
 * Create a minimal mock Express request.
 */
function createMockReq(overrides = {}) {
    return {
        body: { gtcOutput: createMockGtcOutput(), requests: [] },
        query: {},
        ...overrides,
    };
}

// ------------------------------------------------------------------
//  Tests
// ------------------------------------------------------------------

describe('POST /plot/data/batch', () => {
    let batchPlotData;

    before(() => {
        // This will throw if the module doesn't exist yet (red phase of TDD).
        batchPlotData =
            require('../server/batch-data-handler.js').batchPlotData;
    });

    // ------------------------------------------------------------------
    //  Validation
    // ------------------------------------------------------------------

    describe('validation', () => {
        it('returns 400 when requests is missing', async () => {
            if (!batchPlotData) return;

            const req = createMockReq({
                body: { gtcOutput: createMockGtcOutput() },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            assert.equal(res._status, 400);
            assert.ok(res._json.error);
        });

        it('returns 400 when requests is not an array', async () => {
            if (!batchPlotData) return;

            const req = createMockReq({
                body: {
                    gtcOutput: createMockGtcOutput(),
                    requests: 'not-an-array',
                },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            assert.equal(res._status, 400);
            assert.ok(res._json.error);
        });

        it('returns 400 when requests is an empty array', async () => {
            if (!batchPlotData) return;

            const req = createMockReq({
                body: { gtcOutput: createMockGtcOutput(), requests: [] },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            assert.equal(res._status, 400);
            assert.ok(res._json.error);
        });
    });

    // ------------------------------------------------------------------
    //  Happy path
    // ------------------------------------------------------------------

    describe('successful batch', () => {
        it('returns figures for multiple items of the same type', async () => {
            if (!batchPlotData) return;

            const gtcOutput = createMockGtcOutput();
            const req = createMockReq({
                body: {
                    gtcOutput,
                    requests: [
                        { type: 'History', id: 'phi-point' },
                        { type: 'History', id: 'phi-RMS' },
                        { type: 'History', id: 'phi-mode1' },
                    ],
                },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            assert.equal(res._status, 200);
            assert.equal(res._json.results.length, 3);

            res._json.results.forEach((r, i) => {
                assert.equal(r.type, 'History');
                assert.ok(r.figures, `item ${i} should have figures`);
                assert.equal(
                    r.error,
                    undefined,
                    `item ${i} should not have error`
                );
                assert.ok(Array.isArray(r.figures));
            });

            // readData should only have been called ONCE for History (grouped)
            const historyCalls = gtcOutput.readDataCalls.filter(
                c => c === 'History'
            );
            assert.equal(
                historyCalls.length,
                1,
                'readData should be called only once per type'
            );
        });

        it('returns figures for items across different types', async () => {
            if (!batchPlotData) return;

            const gtcOutput = createMockGtcOutput();
            const req = createMockReq({
                body: {
                    gtcOutput,
                    requests: [
                        { type: 'History', id: 'phi-point' },
                        { type: 'Equilibrium', id: '1D-psi-Te' },
                        { type: 'RadialTime', id: 'phi-zonal' },
                    ],
                },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            assert.equal(res._status, 200);
            assert.equal(res._json.results.length, 3);

            res._json.results.forEach(r => {
                assert.ok(r.figures, `${r.type}-${r.id} should have figures`);
                assert.equal(r.error, undefined);
            });

            // readData should have been called once per unique type
            assert.equal(gtcOutput.readDataCalls.length, 3);
            assert.ok(gtcOutput.readDataCalls.includes('History'));
            assert.ok(gtcOutput.readDataCalls.includes('Equilibrium'));
            assert.ok(gtcOutput.readDataCalls.includes('RadialTime'));
        });

        it('calls getPlotData with the correct query parameter', async () => {
            if (!batchPlotData) return;

            const gtcOutput = createMockGtcOutput();
            const req = createMockReq({
                body: {
                    gtcOutput,
                    requests: [{ type: 'History', id: 'phi-point' }],
                },
                query: { snapshot_playing: '' },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            assert.equal(res._status, 200);
            const call = gtcOutput.getPlotDataCalls[0];
            assert.deepEqual(call.query, { snapshot_playing: '' });
        });

        it('preserves result order matching request order', async () => {
            if (!batchPlotData) return;

            const gtcOutput = createMockGtcOutput();
            const requests = [
                { type: 'History', id: 'zzz-last' },
                { type: 'History', id: 'aaa-first' },
                { type: 'Equilibrium', id: 'middle' },
                { type: 'History', id: 'bbb-second' },
            ];
            const req = createMockReq({ body: { gtcOutput, requests } });
            const res = createMockRes();

            await batchPlotData(req, res);

            assert.equal(res._json.results.length, 4);
            res._json.results.forEach((r, i) => {
                assert.equal(r.type, requests[i].type);
                assert.equal(r.id, requests[i].id);
            });
        });
    });

    // ------------------------------------------------------------------
    //  Partial failures
    // ------------------------------------------------------------------

    describe('partial failures', () => {
        it('returns error for an invalid id while valid ids succeed', async () => {
            if (!batchPlotData) return;

            const gtcOutput = createMockGtcOutput({
                getPlotDataResults: {
                    'History-nonexistent': new Error(
                        'Unknown plot id: nonexistent'
                    ),
                },
            });
            const req = createMockReq({
                body: {
                    gtcOutput,
                    requests: [
                        { type: 'History', id: 'phi-point' },
                        { type: 'History', id: 'nonexistent' },
                        { type: 'History', id: 'phi-RMS' },
                    ],
                },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            assert.equal(res._status, 200);
            assert.equal(res._json.results.length, 3);

            // phi-point: success
            assert.ok(res._json.results[0].figures);
            assert.equal(res._json.results[0].error, undefined);

            // nonexistent: error
            assert.equal(res._json.results[1].figures, undefined);
            assert.ok(res._json.results[1].error);
            assert.match(res._json.results[1].error, /nonexistent/);

            // phi-RMS: still succeeds
            assert.ok(res._json.results[2].figures);
            assert.equal(res._json.results[2].error, undefined);
        });

        it('returns error for all items of a type when readData fails', async () => {
            if (!batchPlotData) return;

            const gtcOutput = createMockGtcOutput({
                readDataResults: {
                    Equilibrium: new Error('equilibrium.out not found'),
                },
            });
            const req = createMockReq({
                body: {
                    gtcOutput,
                    requests: [
                        { type: 'History', id: 'phi-point' },
                        { type: 'Equilibrium', id: '1D-psi-Te' },
                        { type: 'Equilibrium', id: '1D-rg-q' },
                    ],
                },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            assert.equal(res._status, 200);
            assert.equal(res._json.results.length, 3);

            // History should succeed
            assert.ok(res._json.results[0].figures);
            assert.equal(res._json.results[0].error, undefined);

            // Equilibrium items should both have errors
            assert.equal(res._json.results[1].figures, undefined);
            assert.ok(res._json.results[1].error);

            assert.equal(res._json.results[2].figures, undefined);
            assert.ok(res._json.results[2].error);
        });

        it('handles mixed valid and invalid types independently', async () => {
            if (!batchPlotData) return;

            const gtcOutput = createMockGtcOutput({
                readDataResults: {
                    BrokenType: new Error('Cannot read BrokenType'),
                },
                getPlotDataResults: {
                    'History-bad-id': new Error('bad id'),
                },
            });
            const req = createMockReq({
                body: {
                    gtcOutput,
                    requests: [
                        { type: 'History', id: 'phi-point' },
                        { type: 'History', id: 'bad-id' },
                        { type: 'BrokenType', id: 'something' },
                    ],
                },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            assert.equal(res._status, 200);
            assert.equal(res._json.results.length, 3);

            // phi-point: success
            assert.ok(res._json.results[0].figures);
            // bad-id: getPlotData error
            assert.ok(res._json.results[1].error);
            // BrokenType: readData error
            assert.ok(res._json.results[2].error);
        });
    });

    // ------------------------------------------------------------------
    //  Summary (reads Equilibrium and extracts radial profiles inline)
    // ------------------------------------------------------------------

    describe('Summary', () => {
        it('returns summary data when type is Summary', async () => {
            if (!batchPlotData) return;

            const radialData = {
                minor: [0, 0.5, 1.0],
                rg: [0, 0.5, 1.0],
                q: [0.8, 1.2, 1.6],
                Te: [100, 200, 300],
                Ti: [50, 100, 150],
            };
            const gtcOutput = createMockGtcOutput({ radialData });

            const req = createMockReq({
                body: {
                    gtcOutput,
                    requests: [{ type: 'Summary', id: 'all' }],
                },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            assert.equal(res._status, 200);
            assert.equal(res._json.results.length, 1);
            assert.ok(res._json.results[0].figures);
            assert.deepEqual(res._json.results[0].figures.minor, [0, 0.5, 1.0]);
            assert.deepEqual(res._json.results[0].figures.q, [0.8, 1.2, 1.6]);

            // Should have called readData('Equilibrium'), not readData('Summary')
            assert.ok(gtcOutput.readDataCalls.includes('Equilibrium'));
            assert.ok(!gtcOutput.readDataCalls.includes('Summary'));
        });

        it('returns error for all Summary items when readData(Equilibrium) fails', async () => {
            if (!batchPlotData) return;

            const gtcOutput = createMockGtcOutput({
                readDataResults: {
                    Equilibrium: new Error('equilibrium.out not found'),
                },
            });
            const req = createMockReq({
                body: {
                    gtcOutput,
                    requests: [{ type: 'Summary', id: 'all' }],
                },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            assert.equal(res._status, 200);
            assert.equal(res._json.results.length, 1);
            assert.equal(res._json.results[0].figures, undefined);
            assert.ok(res._json.results[0].error);
        });

        it('mixes Summary and regular types in one request', async () => {
            if (!batchPlotData) return;

            const radialData = { minor: [0, 1], q: [1, 2] };
            const gtcOutput = createMockGtcOutput({ radialData });
            const req = createMockReq({
                body: {
                    gtcOutput,
                    requests: [
                        { type: 'History', id: 'phi-point' },
                        { type: 'Summary', id: 'all' },
                    ],
                },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            assert.equal(res._status, 200);
            assert.equal(res._json.results.length, 2);

            // History item
            assert.ok(Array.isArray(res._json.results[0].figures));
            // Summary item
            assert.deepEqual(res._json.results[1].figures.minor, [0, 1]);
        });
    });

    // ------------------------------------------------------------------
    //  Deduplication (readData grouping)
    // ------------------------------------------------------------------

    describe('readData deduplication', () => {
        it('calls readData at most once per unique type', async () => {
            if (!batchPlotData) return;

            const gtcOutput = createMockGtcOutput();
            const req = createMockReq({
                body: {
                    gtcOutput,
                    requests: [
                        { type: 'History', id: 'phi-point' },
                        { type: 'History', id: 'phi-RMS' },
                        { type: 'History', id: 'phi-mode1' },
                        { type: 'History', id: 'phi-mode2' },
                        { type: 'History', id: 'ion-density' },
                        { type: 'Equilibrium', id: '1D-psi-Te' },
                        { type: 'Equilibrium', id: '1D-rg-q' },
                        { type: 'History', id: 'ion-momentum' },
                    ],
                },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            assert.equal(res._status, 200);
            assert.equal(res._json.results.length, 8);

            // Only 2 unique types → readData called exactly twice
            assert.equal(
                gtcOutput.readDataCalls.length,
                2,
                'readData should be called exactly twice'
            );
            assert.equal(
                gtcOutput.readDataCalls.filter(c => c === 'History').length,
                1
            );
            assert.equal(
                gtcOutput.readDataCalls.filter(c => c === 'Equilibrium').length,
                1
            );

            // getPlotData should be called 8 times (once per item)
            assert.equal(gtcOutput.getPlotDataCalls.length, 8);
        });

        it('Summary calls readData(Equilibrium), not readData(Summary)', async () => {
            if (!batchPlotData) return;

            const radialData = { minor: [0, 1] };
            const gtcOutput = createMockGtcOutput({ radialData });
            const req = createMockReq({
                body: {
                    gtcOutput,
                    requests: [{ type: 'Summary', id: 'all' }],
                },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            // Must have called readData('Equilibrium'), never 'Summary'
            assert.ok(
                gtcOutput.readDataCalls.includes('Equilibrium'),
                'should call readData(Equilibrium)'
            );
            assert.ok(
                !gtcOutput.readDataCalls.some(c => c === 'Summary'),
                'should not call readData(Summary)'
            );
        });

        it('shares one Equilibrium read between Summary and Equilibrium', async () => {
            const radialData = { minor: [0, 1], q: [1, 2] };
            const gtcOutput = createMockGtcOutput({ radialData });
            const req = createMockReq({
                body: {
                    gtcOutput,
                    requests: [
                        { type: 'Summary', id: 'all' },
                        { type: 'Equilibrium', id: '1D-minor-q' },
                    ],
                },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            assert.equal(res._status, 200);
            assert.equal(
                gtcOutput.readDataCalls.filter(type => type === 'Equilibrium')
                    .length,
                1
            );
        });
    });

    // ------------------------------------------------------------------
    //  Edge cases
    // ------------------------------------------------------------------

    describe('edge cases', () => {
        it('returns 400 when all entries have an empty type field', async () => {
            if (!batchPlotData) return;

            const gtcOutput = createMockGtcOutput();
            const req = createMockReq({
                body: {
                    gtcOutput,
                    requests: [{ type: '', id: 'something' }],
                },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            // Empty type field → no valid entries → 400
            assert.equal(res._status, 400);
        });

        it('returns 400 instead of throwing when every entry is malformed', async () => {
            const req = createMockReq({
                body: {
                    gtcOutput: createMockGtcOutput(),
                    requests: [null, 42, { type: 'History' }],
                },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            assert.equal(res._status, 400);
            assert.ok(res._json.error);
        });

        it('returns per-item errors for invalid entries in a mixed batch', async () => {
            const req = createMockReq({
                body: {
                    gtcOutput: createMockGtcOutput(),
                    requests: [
                        null,
                        { type: 'History', id: 'phi-point' },
                        { type: '   ', id: 'phi-RMS' },
                    ],
                },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            assert.equal(res._status, 200);
            assert.equal(res._json.results.length, 3);
            assert.match(res._json.results[0].error, /non-empty strings/);
            assert.ok(res._json.results[1].figures);
            assert.match(res._json.results[2].error, /non-empty strings/);
            assert.ok(
                res._json.results.every(result => result !== null),
                'response should not contain sparse-array null holes'
            );
        });

        it('handles duplicate requests identically', async () => {
            if (!batchPlotData) return;

            const gtcOutput = createMockGtcOutput();
            const req = createMockReq({
                body: {
                    gtcOutput,
                    requests: [
                        { type: 'History', id: 'phi-point' },
                        { type: 'History', id: 'phi-point' },
                    ],
                },
            });
            const res = createMockRes();

            await batchPlotData(req, res);

            assert.equal(res._status, 200);
            assert.equal(res._json.results.length, 2);
            // Both should have figures (duplicates are fine)
            assert.ok(res._json.results[0].figures);
            assert.ok(res._json.results[1].figures);
        });
    });
});
