'use strict';

export const RATIONAL_SURFACE_LINE_STYLE = Object.freeze({
    color: 'rgba(142.846, 176.35, 49.6957, 0.9)',
    dash: 'dash',
    width: 1,
});

/**
 * Locate q = m/n crossings by linearly interpolating a sampled q profile.
 *
 * A mode can produce more than one result when the profile is non-monotonic.
 * Invalid modes and profile points are ignored.
 *
 * @param {{x: Array<number>, y: Array<number>}} qTrace
 * @param {Array<{m: number, n: number}>} modes
 * @returns {Array<{m: number, n: number, radialPosition: number}>}
 */
export function findRationalSurfaceCrossings(qTrace, modes = []) {
    if (!Array.isArray(qTrace?.x) || !Array.isArray(qTrace?.y)) {
        return [];
    }

    const points = qTrace.x
        .map((x, index) => ({ x: Number(x), q: Number(qTrace.y[index]) }))
        .filter(({ x, q }) => Number.isFinite(x) && Number.isFinite(q));
    if (points.length === 0) {
        return [];
    }

    const crossings = [];
    for (const mode of modes) {
        const m = Number(mode?.m);
        const n = Number(mode?.n);
        if (!Number.isFinite(m) || !Number.isFinite(n) || n === 0) {
            continue;
        }

        const targetQ = m / n;
        const radialPositions = [];
        for (let index = 0; index < points.length - 1; index += 1) {
            const first = points[index];
            const second = points[index + 1];

            if (first.q === targetQ) {
                radialPositions.push(first.x);
            }
            if (
                first.q !== second.q &&
                (targetQ - first.q) * (targetQ - second.q) < 0
            ) {
                radialPositions.push(
                    first.x +
                        ((targetQ - first.q) / (second.q - first.q)) *
                            (second.x - first.x)
                );
            }
        }
        if (points.at(-1).q === targetQ) {
            radialPositions.push(points.at(-1).x);
        }

        [...new Set(radialPositions)].forEach(radialPosition => {
            crossings.push({ m, n, radialPosition });
        });
    }

    return crossings;
}
