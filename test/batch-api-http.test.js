/**
 * HTTP-level integration tests for POST /plot/data/batch.
 *
 * These tests use a real Express listener so JSON parsing, /plot middleware,
 * route registration, and wire serialization are exercised together.
 */

'use strict';

const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const {
    registerBatchPlotDataRoute,
} = require('../server/batch-data-handler.js');

describe('POST /plot/data/batch over HTTP', () => {
    let server;
    let endpoint;
    let gtcOutput;

    before(async () => {
        gtcOutput = {
            data: {
                Equilibrium: {
                    radialData: { minor: [0, 1], q: [1, 2] },
                },
            },
            readDataCalls: [],
            async readData(type) {
                this.readDataCalls.push(type);
            },
            getPlotData(type, id, query) {
                return [{ data: [{ y: [1, 2] }], layout: { type, id, query } }];
            },
        };

        const app = express();
        app.use(express.json());
        app.use('/plot', (req, res, next) => {
            req.body.gtcOutput = gtcOutput;
            next();
        });
        const wrap = func => (...args) => func(...args).catch(args[2]);
        registerBatchPlotDataRoute(app, wrap);
        app.use((err, req, res, next) => {
            res.status(err.status ?? 500).json({ error: err.message });
        });

        await new Promise((resolve, reject) => {
            server = app.listen(0, '127.0.0.1', resolve);
            server.once('error', reject);
        });
        endpoint = `http://127.0.0.1:${server.address().port}/plot/data/batch?dir=test&step=3`;
    });

    after(async () => {
        if (server) {
            await new Promise((resolve, reject) => {
                server.close(err => (err ? reject(err) : resolve()));
            });
        }
    });

    it('parses JSON and returns ordered results through the registered route', async () => {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requests: [
                    { type: 'Summary', id: 'all' },
                    { type: 'Equilibrium', id: '1D-minor-q' },
                    null,
                ],
            }),
        });
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.deepEqual(
            body.results.map(result => result.type),
            ['Summary', 'Equilibrium', null]
        );
        assert.deepEqual(body.results[0].figures.minor, [0, 1]);
        assert.ok(body.results[1].figures);
        assert.match(body.results[2].error, /non-empty strings/);
        assert.equal(
            gtcOutput.readDataCalls.filter(type => type === 'Equilibrium').length,
            1
        );
        assert.equal(body.results[1].figures[0].layout.query.step, '3');
    });

    it('returns 400 for malformed JSON', async () => {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"requests":',
        });

        assert.equal(response.status, 400);
        assert.match(response.headers.get('content-type'), /application\/json/);
    });
});
