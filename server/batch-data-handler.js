/**
 * Batch plot-data handler for the POST /plot/data/batch route.
 *
 * Accepts multiple {type, id} pairs in a single HTTP request, groups them
 * by type to avoid redundant file reads, and returns all results in one
 * response.  Individual item failures are reported per-item rather than
 * aborting the entire batch.
 *
 * @module batch-data-handler
 */

'use strict';

/**
 * Radial-data keys exposed by the Summary type (subset of Equilibrium
 * 1-D radial profiles that the Summary page consumes).
 */
const SUMMARY_KEYS = [
    'minor',
    'rg',
    'q',
    'dlnq_dpsi',
    'Te',
    'dlnTe_dpsi',
    'ne',
    'dlnne_dpsi',
    'Ti',
    'dlnTi_dpsi',
    'ni',
    'dlnni_dpsi',
    'Tf',
    'dlnTf_dpsi',
    'nf',
    'dlnnf_dpsi',
];

/**
 * Express route handler for POST /plot/data/batch.
 *
 * Expects `req.body.gtcOutput` to be set by the upstream /plot middleware.
 *
 * @param {import('express').Request} req
 * @param {Object} req.body
 * @param {import('../GTC-output-parser/main.js')} req.body.gtcOutput
 * @param {Array<{type: string, id: string}>} req.body.requests
 * @param {import('express').Response} res
 */
async function batchPlotData(req, res) {
    const { gtcOutput, requests } = req.body;

    // ------------------------------------------------------------------
    //  Validation
    // ------------------------------------------------------------------
    if (!Array.isArray(requests) || requests.length === 0) {
        res.status(400).json({ error: 'requests must be a non-empty array' });
        return;
    }

    // ------------------------------------------------------------------
    //  Normalise valid entries and record per-item validation failures.
    //  Track the original index so output always matches request order.
    // ------------------------------------------------------------------
    const entries = [];
    const results = new Array(requests.length);
    for (let i = 0; i < requests.length; i++) {
        const request = requests[i];
        const type = request?.type;
        const id = request?.id;
        if (
            typeof type === 'string' &&
            type.trim().length > 0 &&
            typeof id === 'string' &&
            id.trim().length > 0
        ) {
            entries.push({ type, id, origIdx: i });
        } else {
            results[i] = {
                type: typeof type === 'string' ? type : null,
                id: typeof id === 'string' ? id : null,
                error: 'type and id must be non-empty strings',
            };
        }
    }

    if (entries.length === 0) {
        res.status(400).json({
            error: 'no valid {type, id} entries in requests',
        });
        return;
    }

    // ------------------------------------------------------------------
    //  Group by type so that readData() is called at most once per type.
    // ------------------------------------------------------------------
    /** @type {Map<string, Array<{type: string, id: string, origIdx: number}>>} */
    const byType = new Map();
    for (const entry of entries) {
        const group = byType.get(entry.type);
        if (group) {
            group.push(entry);
        } else {
            byType.set(entry.type, [entry]);
        }
    }

    // ------------------------------------------------------------------
    //  Phase 1 – read each underlying data file once (async, expensive).
    //  Summary depends on Equilibrium, so those two public types share one
    //  read operation when requested together.
    // ------------------------------------------------------------------
    const readTypes = new Set(
        [...byType.keys()].map(type =>
            type === 'Summary' ? 'Equilibrium' : type
        )
    );
    /** @type {Map<string, {ok: boolean, error?: unknown}>} */
    const readDataCache = new Map();

    await Promise.all(
        [...readTypes].map(async type => {
            try {
                await gtcOutput.readData(type);
                readDataCache.set(type, { ok: true });
            } catch (err) {
                readDataCache.set(type, { ok: false, error: err });
            }
        })
    );

    let summaryData;
    let summaryError;
    if (byType.has('Summary') && readDataCache.get('Equilibrium').ok) {
        try {
            const radialData = gtcOutput.data['Equilibrium'].radialData;
            summaryData = {};
            for (const key of SUMMARY_KEYS) {
                summaryData[key] = radialData[key];
            }
        } catch (err) {
            summaryError = err;
        }
    }

    // ------------------------------------------------------------------
    //  Phase 2 – collect per-item results via getPlotData.
    // ------------------------------------------------------------------
    for (const { type, id, origIdx } of entries) {
        const readType = type === 'Summary' ? 'Equilibrium' : type;
        const readResult = readDataCache.get(readType);

        if (!readResult.ok) {
            // The entire type failed to read.
            results[origIdx] = {
                type,
                id,
                error: `readData failed for type "${readType}": ${
                    readResult.error?.message ?? String(readResult.error)
                }`,
            };
            continue;
        }

        if (type === 'Summary') {
            if (summaryError) {
                results[origIdx] = {
                    type,
                    id,
                    error: `Summary data extraction failed: ${
                        summaryError.message ?? String(summaryError)
                    }`,
                };
            } else {
                results[origIdx] = { type, id, figures: summaryData };
            }
            continue;
        }

        // Normal type: call getPlotData
        try {
            const figures = gtcOutput.getPlotData(type, id, req.query);
            results[origIdx] = { type, id, figures };
        } catch (err) {
            results[origIdx] = {
                type,
                id,
                error: `getPlotData failed for "${type}-${id}": ${err.message}`,
            };
        }
    }

    res.json({ results });
}

/**
 * Register the batch endpoint on an Express application or router.
 * Keeping registration here lets integration tests exercise the same route
 * wiring used by the production server.
 *
 * @param {import('express').Application|import('express').Router} app
 * @param {(handler: Function) => Function} wrap - Server async error wrapper.
 */
function registerBatchPlotDataRoute(app, wrap) {
    app.post(
        '/plot/data/batch',
        wrap(async (req, res) => {
            await batchPlotData(req, res);
        })
    );
}

module.exports = { batchPlotData, registerBatchPlotDataRoute };
