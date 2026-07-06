'use strict';

/**
 * Time-unit conversion for the GTC Visualization plot page.
 *
 * The server always returns time-axis data in the base unit R₀/c_s.
 * This module provides:
 *   - Conversion factors for alternative units (R₀/v_A, tstep, μs)
 *   - Axis rescaling for History and RadialTime figures
 *   - Lazy fetching of the simulation parameters needed for conversion
 *
 * ## State owned by this module
 *
 * Stored on the central state object (`state.js`):
 *   `state.units`          — currently selected time unit
 *   `state.timeUnitFactor` — conversion factors (base → each unit)
 *   `state.timeStep`       — ndiag * tstep * timeUnitFactor[units.time]
 *   `state.basicParameters` — cached simulation parameters from gtc.out
 *
 * @module units
 */

import state from './state.js';
import { requestPlotData } from './api.js';

// ------------------------------------------------------------------
//  Unit labels (LaTeX for Plotly axis titles)
// ------------------------------------------------------------------

export const TIME_UNIT_LABEL = {
    soundSpeed: '$R_0/c_s$',
    alfvenSpeed: '$R_0/v_A$',
    tstep: '$tstep$',
    microsecond: '$\\mu s$',
};

// ------------------------------------------------------------------
//  Parameter fetching
// ------------------------------------------------------------------

/**
 * Fetch simulation parameters from the server (lazy, cached).
 * Populates `state.basicParameters` on first call; subsequent calls
 * return immediately.
 *
 * @returns {Promise<void>}
 */
export async function getBasicParameters() {
    if (!state.basicParameters) {
        const res = await requestPlotData('data/basicParameters');
        state.basicParameters = await res.json();
    }
}

// ------------------------------------------------------------------
//  Conversion factor computation
// ------------------------------------------------------------------

/**
 * Recompute `state.timeUnitFactor` and `state.timeStep` from the current
 * simulation parameters and the user's selected time unit.
 *
 * Must be called after `getBasicParameters()` has populated
 * `state.basicParameters`, and whenever the user changes the unit
 * selector or before plotting new data.
 *
 * @returns {Promise<void>}
 */
export async function refreshTimeUnitFactor() {
    await getBasicParameters();
    const bp = state.basicParameters;
    const baseTimeStep = bp.ndiag * bp.tstep;

    // v_A^2 / c_s^2 = B_0^2 / (mu_0 n_i T_e) = 2 Z_i / beta_e
    // => v_A / c_s = sqrt(2 * qion / betae)
    // so the ratio R0/v_A in units of R0/c_s is 1 / (v_A / c_s).
    // Note: `bp.inorm` may shift the reference point used for `betae`,
    // which can introduce a small discrepancy in the absolute time unit;
    // this is a known limitation that we may revisit later.
    let vaOverCs = 1;
    if (
        typeof bp.betae === 'number' &&
        bp.betae > 0 &&
        typeof bp.qion === 'number' &&
        bp.qion > 0
    ) {
        vaOverCs = Math.sqrt(2 * bp.qion / bp.betae);
    }

    state.timeUnitFactor = {
        soundSpeed: 1,
        alfvenSpeed: vaOverCs,
        tstep: 1 / bp.tstep,
        // `bp.tstep_seconds` is the SI duration (seconds) of ONE simulation
        // step, parsed from the line "tstep in seconds: ..." in gtc.out.
        // The base time axis unit (when `soundSpeed` is selected) advances by
        // `bp.ndiag * bp.tstep` per data point, so to convert from base
        // unit -> microseconds we multiply by
        //     (bp.tstep_seconds / bp.tstep) * 1e6
        // Fall back to 0 if `tstep_seconds` is unavailable.
        microsecond:
            typeof bp.tstep_seconds === 'number' && bp.tstep_seconds > 0
                ? (bp.tstep_seconds / bp.tstep) * 1e6
                : 0,
    };
    state.timeStep =
        baseTimeStep * state.timeUnitFactor[state.units.time];
}

// ------------------------------------------------------------------
//  Figure rescaling
// ------------------------------------------------------------------

/**
 * Apply the currently selected time unit to figures returned by the
 * backend.
 *
 * The server always returns time-axis data in the base unit R₀/c_s
 * (with axis label `$R_0/c_s$` for History and `$\text{time step}$`
 * for RadialTime).  This function rescales the x-axis values and
 * updates the x-axis labels accordingly.
 *
 * @param {string} plotId - The plot button id (e.g. "History-phi-point").
 * @param {Array<Object>} figures - Array of Plotly figure descriptors.
 */
export function applyTimeUnitToFigures(plotId, figures) {
    const unit = state.units?.time || 'soundSpeed';
    const factor = state.timeUnitFactor?.[unit] ?? 1;
    const label = TIME_UNIT_LABEL[unit] || TIME_UNIT_LABEL.soundSpeed;

    if (plotId.startsWith('History')) {
        for (const fig of figures) {
            if (!fig?.data) continue;
            for (const trace of fig.data) {
                if (Array.isArray(trace.x)) {
                    trace.x = trace.x.map(v => v * factor);
                }
            }
            // last figure of mode plot uses 'mode number' as x-axis
            if (
                plotId.includes('-mode') &&
                fig.layout?.xaxis?.title?.text === '$\\text{mode number}$'
            ) {
                continue;
            }
            if (fig.layout?.xaxis?.title) {
                fig.layout.xaxis.title.text = label;
            }
        }
    } else if (plotId.startsWith('RadialTime')) {
        const baseTimeStep =
            state.basicParameters.ndiag * state.basicParameters.tstep;
        const dt = baseTimeStep * factor;
        for (const fig of figures) {
            if (!fig?.data) continue;
            for (const trace of fig.data) {
                // RadialTime is a transposed heatmap: x corresponds to the
                // outer (time) dimension of z.
                const stepCount = Array.isArray(trace.z) ? trace.z.length : 0;
                if (stepCount > 0) {
                    trace.x = Array.from(
                        { length: stepCount },
                        (_, i) => (i + 1) * dt
                    );
                }
            }
            if (fig.layout?.xaxis?.title) {
                fig.layout.xaxis.title.text = label;
            }
        }
    }
}
