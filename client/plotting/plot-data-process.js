'use strict';

// Snapshot functions (snapshotSpectrum, snapshotPoloidalPreview,
// snapshotPoloidal, drawPoloidalDataPlotly, drawPoloidalDataWebGL,
// buildShaderProgram, createColorMap, packTextureArgs, getTicks,
// getRationalSurface) have moved to snapshot.js

import state from '../control/state.js';
import { interleave, unInterleave } from '../shared/util.js';
import { createPlotConfig } from '../components/figure-data-download.js';
export async function historyMode(figures, interval1 = null, interval2 = null) {
    // `interval1`/`interval2` are user-selected zoom ranges (as fractions of
    // the total data length) coming from the rangesliders. When they are
    // null (i.e. the initial call) we fall back to the conventional
    // measurement window [0.43, 0.98] and show the full data extent.
    const measure1 = interval1 ?? [0.43, 0.98];
    const measure2 = interval2 ?? [0.43, 0.98];

    // deconstructing figures
    let [componentsFig, growthFig, freqFig, spectralFig] = figures;

    // growth rate figure
    let { gamma, measurePts } = cal_gamma(
        growthFig.data[0].y,
        state.timeStep,
        measure1
    );
    growthFig.data[1] = {
        x: [measurePts[0].x, measurePts[1].x],
        y: [measurePts[0].y, measurePts[1].y],
        type: 'scatter',
        line: { dash: 'dot', color: 'rgb(245, 10, 10)', width: 3 },
        markers: { color: 'rgb(255, 0, 0)', size: 8 },
    };
    growthFig.layout.title.text = `$\\gamma=${gamma.toPrecision(5)}$`;
    {
        // Pin the default x range to the data extent (or to the user-selected
        // zoom when recalculating). Without this Plotly's autorange together
        // with the rangeslider pads the visible range beyond the last data
        // point. The interval->absolute conversion mirrors the absolute->
        // interval conversion done in addHistoryRecal (divide by `len`).
        const xs = growthFig.data[0].x;
        const len = xs[xs.length - 1];
        growthFig.layout.xaxis.range = interval1
            ? [interval1[0] * len, interval1[1] * len]
            : [xs[0], len];
        growthFig.layout.xaxis.autorange = false;
    }
    growthFig.layout.xaxis.rangeslider = {
        bgcolor: 'rgb(200,200,210)',
    };

    // frequency figure
    let y0 = componentsFig.data[0].y[0];
    y0 = y0 == 0 ? 1 : y0;
    let yReals = componentsFig.data[0].y.map(
        (y, i) => y / (Math.exp(gamma * (i + 1) * state.timeStep) * y0)
    );
    let yImages = componentsFig.data[1].y.map(
        (y, i) => y / (Math.exp(gamma * (i + 1) * state.timeStep) * y0)
    );
    let omega;
    ({ omega, measurePts } = cal_omega_r(
        yReals,
        yImages,
        state.timeStep,
        measure2
    ));
    freqFig.data[0] = {
        x: [...Array(yReals.length).keys()].map(i => (i + 1) * state.timeStep),
        y: yReals,
        type: 'scatter',
        mode: 'lines',
    };
    freqFig.data[1] = {
        x: [...Array(yReals.length).keys()].map(i => (i + 1) * state.timeStep),
        y: yImages,
        type: 'scatter',
        mode: 'lines',
    };
    freqFig.data[2] = {
        x: [measurePts[0].x, measurePts[1].x],
        y: [measurePts[0].y, measurePts[1].y],
        type: 'scatter',
        line: { dash: 'dot', color: 'rgb(245, 10, 10)', width: 3 },
        markers: { color: 'rgb(255, 0, 0)', size: 8 },
    };
    freqFig.layout.title.text = `$\\omega=${omega.toPrecision(5)}$`;
    {
        const xs = freqFig.data[0].x;
        const len = xs[xs.length - 1];
        freqFig.layout.xaxis.range = interval2
            ? [interval2[0] * len, interval2[1] * len]
            : [xs[0], len];
        freqFig.layout.xaxis.autorange = false;
    }
    freqFig.layout.xaxis.rangeslider = {
        bgcolor: 'rgb(200,200,210)',
    };

    // spectral figure
    let powerSpectrum = cal_spectrum(yReals, yImages, state.timeStep, measure2);
    spectralFig.data[0] = Object.assign(powerSpectrum, {
        type: 'scatter',
        mode: 'lines',
    });

    if (navigator.clipboard) {
        await navigator.clipboard.writeText(
            `${gamma.toPrecision(5)}, ${omega.toPrecision(5)}`
        );
    }
}
export async function trackingPlot(figures) {
    const zeta = figures.pop().extraData;

    const figureDiv1 = document.getElementById('figure-1');
    await Plotly.newPlot(
        figureDiv1,
        figures[0].data,
        figures[0].layout,
        createPlotConfig({ editable: true })
    );

    // Plotly will do the spline for me
    const [carpet, scatter] = figureDiv1.calcdata;

    Object.assign(figures[1].data[0], {
        x: scatter.map(({ x }, i) => x * Math.cos(zeta[i])),
        y: scatter.map(({ x }, i) => x * Math.sin(zeta[i])),
        z: scatter.map(({ y }) => y),
    });

    Plotly.newPlot(
        'figure-2',
        figures[1].data,
        figures[1].layout,
        createPlotConfig({ editable: true })
    );
}

export function addSimulationRegion(fig) {
    const [rg0, rg1] = state.basicParameters.radial_region;
    const rgd =
        rg0 +
        (state.basicParameters.diag_flux / state.basicParameters.mpsi) *
            (rg1 - rg0);
    const data = fig.data[0].y;

    let y_min = Infinity,
        y_max = -Infinity;
    data.forEach(y => {
        if (y_min > y) {
            y_min = y;
        }
        if (y_max < y) {
            y_max = y;
        }
    });
    if (y_min == y_max) {
        y_max = y_min + 1;
    }

    const extendRegion = (x0, x1, s) => {
        return [x0 - s * (x1 - x0), x1 + s * (x1 - x0)];
    };

    const sep_props = {
        y: extendRegion(y_min, y_max, 0.2),
        mode: 'lines',
        line: {
            color: 'rgb(225, 156, 36)',
            width: 3,
        },
        showlegend: true,
    };
    fig.data.forEach(d => (d.showlegend = false));
    fig.data.push(
        // simulation region border
        {
            x: [rg0, rg0],
            ...sep_props,
            showlegend: false,
        },
        {
            name: 'Simulation Region',
            x: [rg1, rg1],
            fill: 'tonextx',
            ...sep_props,
        },
        // diagnostic flux
        {
            name: 'Diagnostic Flux',
            x: [rgd, rgd],
            ...sep_props,
            line: {
                color: 'rgb(143, 177, 49)',
                width: 2,
            },
        }
    );

    fig.layout.yaxis.range = extendRegion(y_min, y_max, 0.1);
}

/**
 * Calculate the growth rate of the time series array
 *
 * @param {Array<Number>} ys a series of data
 * @param {number} dt time step
 * @param {Array<Number>} interval
 *
 * @returns {{gamma: number, measurePts:{x:number, y:number}[]}}} growth rate
 */
export function cal_gamma(ys, dt, interval) {
    let [tIni, tEnd] = interval;

    let tIniIndex = Math.floor(tIni * ys.length);
    let tEndIndex = Math.floor(tEnd * ys.length);

    let gamma =
        (Math.log(ys[tEndIndex]) - Math.log(ys[tIniIndex])) /
        ((tEndIndex - tIniIndex) * dt);

    let p1 = { x: (tIniIndex + 1) * dt, y: ys[tIniIndex] };
    let p2 = { x: (tEndIndex + 1) * dt, y: ys[tEndIndex] };

    return {
        gamma: gamma,
        measurePts: [p1, p2],
    };
}

/**
 * Calculate the frequency of the array
 *
 * @param {Array<Number>} yReals
 * @param {number} dt time step
 * @param {Array<Number>} interval
 *
 * @returns {{omega:number, measurePts:{x:number, y:number}[]}}
 */
export function cal_omega_r(yReals, yImages, dt, interval) {
    let [tIni, tEnd] = interval;

    let tIniIndex = Math.floor(tIni * yReals.length);
    let tEndIndex = Math.floor(tEnd * yReals.length);

    const findMaximuns = ys => {
        const maximums = [];
        const section = [];
        for (
            let i = Math.max(tIniIndex, 1);
            i < Math.min(tEndIndex, yReals.length - 1);
            ++i
        ) {
            section.push((ys[i - 1] + ys[i] + ys[i + 1]) / 3);
        }
        section.forEach((y, i, arr) => {
            if (
                i > 0 &&
                i < arr.length - 1 &&
                y > arr[i - 1] &&
                y > arr[i + 1]
            ) {
                maximums.push([i + tIniIndex, y]);
            }
        });
        return maximums;
    };

    const realMaximums = findMaximuns(yReals);
    const imagMaximums = findMaximuns(yImages);

    const maximums =
        realMaximums.length > imagMaximums.length ? realMaximums : imagMaximums;

    let omega;
    let periodNum = maximums.length - 1;
    let p1 = { x: null, y: null };
    let p2 = { x: null, y: null };
    if (periodNum < 1) {
        omega = 0;
    } else {
        p1.x = (maximums[0][0] + 1) * dt;
        p1.y = maximums[0][1];
        p2.x = (maximums[maximums.length - 1][0] + 1) * dt;
        p2.y = maximums[maximums.length - 1][1];
        omega = (2 * Math.PI * periodNum) / (p2.x - p1.x);
    }

    return {
        omega: omega,
        measurePts: [p1, p2],
    };
}

/**
 * Calculate power spectrum, asynchronously
 *
 * @param {Array<Number>} reals
 * @param {Array<Number>} images
 * @param {number} timeStep
 *
 * @returns {{x: Array<Number>, y: Array<Number>}} power spectrum
 */
export function cal_spectrum(reals, images, timeStep, interval) {
    const [t_ini, t_end] = interval.map(t => Math.floor(t * reals.length));
    const len = t_end - t_ini;
    const halfLen = Math.floor(len / 2);

    const plan = new fftw['c2c']['fft1d'](len);

    const spectrum = unInterleave(
        plan.forward(
            interleave(reals.slice(t_ini, t_end), images.slice(t_ini, t_end))
        )
    ).map(([re, im]) => Math.sqrt(re * re + im * im));

    plan.dispose();

    return {
        x: [...Array(len).keys()].map(
            i => ((2 * Math.PI) / (len * timeStep)) * (i - halfLen)
        ),
        y: Array.from(spectrum.slice(len - halfLen)).concat(
            Array.from(spectrum.slice(0, len - halfLen))
        ),
    };
}

// interleave and unInterleave are now imported from util.js

// min_max is now imported from util.js
