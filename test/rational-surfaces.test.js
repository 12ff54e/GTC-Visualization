/** Tests for equilibrium rational-surface overlays. */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

describe('equilibrium rational surfaces', () => {
    let rationalSurfaceNRange;
    let rationalSurfaceTraces;
    let applyRationalSurfaceTraces;
    let originalWindow;

    before(async () => {
        originalWindow = global.window;
        global.window = {};
        ({
            rationalSurfaceNRange,
            rationalSurfaceTraces,
            applyRationalSurfaceTraces,
        } = await import('../client/components/rational-surfaces.js'));
    });

    after(() => {
        if (originalWindow === undefined) {
            delete global.window;
        } else {
            global.window = originalWindow;
        }
    });

    it('derives the slider maximum and initial n from configured modes', () => {
        assert.deepEqual(rationalSurfaceNRange([12, 4, 8, 0]), {
            min: 1,
            max: 12,
            initial: 12,
        });
        assert.deepEqual(rationalSurfaceNRange([]), {
            min: 1,
            max: 1,
            initial: 1,
        });
    });

    it('creates vertical lines at interpolated m/n crossing positions', () => {
        const traces = rationalSurfaceTraces(
            {
                x: [0, 1, 2],
                y: [1.1, 1.9, 2.6],
            },
            2
        );

        assert.deepEqual(
            traces.map(trace => [trace.meta.m, trace.meta.n]),
            [
                [3, 2],
                [4, 2],
                [5, 2],
            ]
        );
        assert.deepEqual(traces[0].x, [0.5, 0.5]);
        assert.deepEqual(traces[0].y, [1.1, 2.6]);
        assert.ok(Math.abs(traces[1].x[0] - 8 / 7) < 1e-12);
        assert.ok(Math.abs(traces[2].x[0] - 13 / 7) < 1e-12);
        assert.equal(traces[0].line.dash, 'dot');
        assert.equal(traces[0].hovertemplate, 'm=3<extra></extra>');
    });

    it('marks every radial crossing on a non-monotonic q profile', () => {
        const traces = rationalSurfaceTraces(
            {
                x: [0, 1, 2],
                y: [1, 2, 1],
            },
            2
        );

        assert.deepEqual(
            traces
                .filter(trace => trace.meta.m === 3)
                .map(trace => trace.x),
            [
                [0.5, 0.5],
                [1.5, 1.5],
            ]
        );
    });

    it('replaces old rational-surface traces without touching q data', () => {
        const qTrace = { x: [0, 1], y: [1, 2] };
        const figure = {
            data: [
                qTrace,
                {
                    x: [0.5, 0.5],
                    y: [1, 2],
                    meta: { gtcRationalSurface: true, m: 3, n: 2 },
                },
            ],
        };

        applyRationalSurfaceTraces(figure, 1);

        assert.equal(figure.data[0], qTrace);
        assert.equal(qTrace.showlegend, false);
        assert.equal(figure.data.length, 3);
        assert.deepEqual(
            figure.data.slice(1).map(trace => trace.meta),
            [
                { gtcRationalSurface: true, m: 1, n: 1 },
                { gtcRationalSurface: true, m: 2, n: 1 },
            ]
        );
    });

    it('returns no surfaces for invalid n or incomplete data', () => {
        assert.deepEqual(rationalSurfaceTraces({ x: [0], y: [1] }, 0), []);
        assert.deepEqual(rationalSurfaceTraces({ x: [], y: [] }, 2), []);
    });
});
