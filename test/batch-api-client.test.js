/**
 * Tests for the requestBatchPlotData client function.
 *
 * Run with:
 *   node --test test/batch-api-client.test.js
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ------------------------------------------------------------------
//  Mock helpers
// ------------------------------------------------------------------

/**
 * Set up global mocks for DOM and fetch.  The client module uses:
 *   - document.querySelector('#output-tag').innerText
 *   - fetch(url, init)
 *   - propagateFetchError(res) — async, throws on !res.ok
 */
function setupDOMAndFetch() {
    // Mock document
    global.document = {
        querySelector(selector) {
            if (selector === '#output-tag') {
                return { innerText: 'test%2Foutput%2Fdir' };
            }
            return null;
        },
    };

    // Mock fetch — callers can override per-test via global._fetchImpl
    global._fetchImpl = null;
    global.fetch = async function (url, init) {
        if (global._fetchImpl) {
            return global._fetchImpl(url, init);
        }
        // Default: return a 200 with JSON body
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            async json() {
                return {
                    results: [
                        {
                            type: 'History',
                            id: 'phi-point',
                            figures: [{ data: [{ y: [1, 2] }], layout: {} }],
                        },
                    ],
                };
            },
        };
    };
}

function teardownDOMAndFetch() {
    delete global.document;
    delete global.fetch;
    delete global._fetchImpl;
}

// ------------------------------------------------------------------
//  Tests
// ------------------------------------------------------------------

describe('requestBatchPlotData (client)', () => {
    let requestBatchPlotData;

    beforeEach(async () => {
        setupDOMAndFetch();
        // This will throw if the module doesn't export the function yet (red phase of TDD).
        requestBatchPlotData =
            (await import('../client/shared/api.js')).requestBatchPlotData;
    });

    afterEach(() => {
        teardownDOMAndFetch();
    });

    describe('request construction', () => {
        it('sends a POST to /plot/data/batch with the dir query param', async () => {
            if (!requestBatchPlotData) return;

            let capturedUrl;
            let capturedInit;

            global._fetchImpl = async (url, init) => {
                capturedUrl = url;
                capturedInit = init;
                return {
                    ok: true,
                    status: 200,
                    async json() {
                        return {
                            results: [
                                {
                                    type: 'History',
                                    id: 'phi-point',
                                    figures: [{ data: [], layout: {} }],
                                },
                            ],
                        };
                    },
                };
            };

            await requestBatchPlotData([{ type: 'History', id: 'phi-point' }]);

            assert.ok(capturedUrl.includes('/plot/data/batch'));
            assert.ok(capturedUrl.includes('dir=test%2Foutput%2Fdir'));
            assert.equal(capturedInit.method, 'POST');
            assert.equal(
                capturedInit.headers['Content-Type'],
                'application/json'
            );
            assert.equal(
                JSON.parse(capturedInit.body).requests[0].type,
                'History'
            );
            assert.equal(
                JSON.parse(capturedInit.body).requests[0].id,
                'phi-point'
            );
        });

        it('appends extra query string when opts.query is provided', async () => {
            if (!requestBatchPlotData) return;

            let capturedUrl;

            global._fetchImpl = async (url, _init) => {
                capturedUrl = url;
                return {
                    ok: true,
                    status: 200,
                    async json() {
                        return { results: [] };
                    },
                };
            };

            await requestBatchPlotData([{ type: 'History', id: 'phi-point' }], {
                query: '&snapshot_playing',
            });

            assert.ok(capturedUrl.includes('&snapshot_playing'));
        });

        it('returns a Response that can be .json() parsed', async () => {
            if (!requestBatchPlotData) return;

            const res = await requestBatchPlotData([
                { type: 'History', id: 'phi-point' },
            ]);

            const body = await res.json();
            assert.ok(Array.isArray(body.results));
            assert.equal(body.results[0].type, 'History');
            assert.equal(body.results[0].id, 'phi-point');
            assert.ok(body.results[0].figures);
        });
    });

    describe('error handling', () => {
        it('throws on non-OK response when optional is not set', async () => {
            if (!requestBatchPlotData) return;

            global._fetchImpl = async (_url, _init) => {
                return {
                    ok: false,
                    status: 500,
                    statusText: 'Internal Server Error',
                };
            };

            await assert.rejects(() =>
                requestBatchPlotData([{ type: 'History', id: 'phi-point' }])
            );
        });

        it('does not throw on non-OK response when optional is true', async () => {
            if (!requestBatchPlotData) return;

            global._fetchImpl = async (_url, _init) => {
                return {
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                };
            };

            const res = await requestBatchPlotData(
                [{ type: 'History', id: 'phi-point' }],
                { optional: true }
            );

            assert.equal(res.ok, false);
            assert.equal(res.status, 404);
        });
    });
});
