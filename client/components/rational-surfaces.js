'use strict';

/**
 * Rational-surface controls and overlays for equilibrium q profiles.
 *
 * For a selected toroidal mode number n, the radial position of every
 * q = m/n crossing is drawn as a vertical dashed line.
 *
 * @module rational-surfaces
 */

import state from '../control/state.js';
import {
    findRationalSurfaceCrossings,
    RATIONAL_SURFACE_LINE_STYLE,
} from '../shared/rational-surfaces.js';
import { refreshPlotRangeControls } from './figure-range-controls.js';

const CONTROL_ID = 'rational-surface-controls';
const SLIDER_ID = 'rational-surface-n';

function isRationalSurfaceTrace(trace) {
    return trace?.meta?.gtcRationalSurface === true;
}

/** Derive a useful slider range from the configured toroidal modes. */
export function rationalSurfaceNRange(nModes = []) {
    const positiveModes = nModes
        .map(Number)
        .filter(Number.isFinite)
        .map(Math.trunc)
        .filter(n => n > 0);

    return positiveModes.length > 0
        ? {
              min: 1,
              max: Math.max(...positiveModes),
              initial: positiveModes[0],
          }
        : { min: 1, max: 1, initial: 1 };
}

/**
 * Build Plotly traces at the radial positions of all q = m/n crossings.
 *
 * @param {Object} qTrace Plotly trace containing matching x and y arrays.
 * @param {number} n Selected positive toroidal mode number.
 * @returns {Array<Object>}
 */
export function rationalSurfaceTraces(qTrace, n) {
    n = Math.trunc(Number(n));
    if (n < 1 || !Array.isArray(qTrace?.x) || !Array.isArray(qTrace?.y)) {
        return [];
    }

    const points = qTrace.x
        .map((x, index) => ({ x, q: qTrace.y[index] }))
        .filter(({ x, q }) => Number.isFinite(x) && Number.isFinite(q));
    if (points.length === 0) {
        return [];
    }

    const qs = points.map(({ q }) => q);
    const qMin = Math.min(...qs);
    const qMax = Math.max(...qs);
    const mMin = Math.ceil(qMin * n);
    const mMax = Math.floor(qMax * n);
    const modes = Array.from(
        { length: mMax - mMin + 1 },
        (_, index) => ({ m: mMin + index, n })
    );

    return findRationalSurfaceCrossings(qTrace, modes).map(
        ({ m, n, radialPosition }) => {
            return {
                x: [radialPosition, radialPosition],
                y: [qMin, qMax],
                type: 'scatter',
                mode: 'lines',
                name: `m/n = ${m}/${n}`,
                legendgroup: 'rational-surfaces',
                showlegend: false,
                line: { ...RATIONAL_SURFACE_LINE_STYLE },
                hovertemplate: `m=${m}<extra></extra>`,
                meta: { gtcRationalSurface: true, m, n },
            };
        }
    );
}

/** Replace any previous rational-surface overlays on a Plotly figure. */
export function applyRationalSurfaceTraces(figure, n) {
    const baseTraces = (figure?.data ?? []).filter(
        trace => !isRationalSurfaceTrace(trace)
    );
    if (!figure) {
        return figure;
    }

    if (baseTraces[0]) {
        baseTraces[0].showlegend = false;
    }

    figure.data = [
        ...baseTraces,
        ...rationalSurfaceTraces(baseTraces[0], n),
    ];
    return figure;
}

export function selectedRationalSurfaceN() {
    const value = Number(document.getElementById(SLIDER_ID)?.value);
    return Number.isInteger(value) && value > 0 ? value : 1;
}

export function showRationalSurfaceControl(visible) {
    const control = document.getElementById(CONTROL_ID);
    if (control) {
        control.hidden = !visible;
    }
}

/** Add the n slider to the Equilibrium 1D form. */
export function setupRationalSurfaceControl(panel, nModes) {
    if (document.getElementById(CONTROL_ID)) {
        return;
    }

    const { min, max, initial } = rationalSurfaceNRange(nModes);
    const control = document.createElement('div');
    control.id = CONTROL_ID;
    control.className = 'rational-surface-controls';
    control.hidden = true;

    const label = document.createElement('label');
    label.htmlFor = SLIDER_ID;
    label.append('Rational surfaces for n = ');

    const output = document.createElement('output');
    output.setAttribute('for', SLIDER_ID);
    output.textContent = String(initial);
    label.append(output);

    const slider = document.createElement('input');
    Object.assign(slider, {
        id: SLIDER_ID,
        type: 'range',
        min: String(min),
        max: String(max),
        step: '1',
        value: String(initial),
    });

    slider.addEventListener('input', async () => {
        output.textContent = slider.value;
        if (!state.current_plot_btn?.id.match(/^Equilibrium-1D-.+-q$/)) {
            return;
        }

        const graphDiv = document.getElementById('figure-1');
        if (!Array.isArray(graphDiv?.data)) {
            return;
        }

        applyRationalSurfaceTraces(graphDiv, Number(slider.value));
        await Plotly.react(graphDiv, graphDiv.data, graphDiv.layout);
        refreshPlotRangeControls();
    });

    control.append(label, slider);
    panel.querySelector('form').append(control);
}
