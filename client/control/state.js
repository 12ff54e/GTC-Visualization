'use strict';

/**
 * Centralized application state for the GTC Visualization plot page.
 *
 * Each property block is annotated with its owning concern.  All modules
 * import `state` directly via ES modules.  The object is also exposed as
 * `window.GTCGlobal` for interactive inspection in the browser console.
 *
 * To add a new piece of state:
 *   1. Add the property below in the appropriate section.
 *   2. Document its type, default value, and owning module.
 *
 * @module state
 */

const state = {
    // ------------------------------------------------------------------
    //  Units (refreshed by refreshTimeUnitFactor / applyTimeUnitToFigures)
    // ------------------------------------------------------------------

    /**
     * Currently selected time unit.
     * One of: 'soundSpeed' | 'alfvenSpeed' | 'tstep' | 'microsecond'.
     * @type {{time: string}}
     */
    units: { time: 'soundSpeed' },

    /**
     * Conversion factors FROM the base unit (sound speed: R₀/c_s) TO each
     * supported unit.  Recomputed by refreshTimeUnitFactor() whenever the
     * user changes the unit selector or before plotting new data.
     * @type {{soundSpeed: number, alfvenSpeed: number, tstep: number, microsecond: number}}
     */
    timeUnitFactor: { soundSpeed: 1, alfvenSpeed: 1, tstep: 1, microsecond: 1 },

    /**
     * Time step between consecutive data points expressed in the currently
     * selected unit:  ndiag * tstep * timeUnitFactor[units.time].
     * @type {number|undefined}
     */
    timeStep: undefined,

    // ------------------------------------------------------------------
    //  Panel / figure lifecycle
    // ------------------------------------------------------------------

    /**
     * The currently visible sub-panel DOM element (e.g. History-panel).
     * @type {HTMLElement|undefined}
     */
    activePanel: undefined,

    /**
     * The button whose plot data is currently displayed.
     * @type {HTMLElement|undefined}
     */
    current_plot_btn: undefined,

    /**
     * The currently selected snapshot file-name button.
     * @type {HTMLElement|undefined}
     */
    current_snapshot: undefined,

    /**
     * The sub-plot button inside a snapshot panel that was last clicked.
     * @type {HTMLElement|undefined}
     */
    current_snapshot_figure: undefined,

    /**
     * Whether the snapshot player animation loop is running.
     * @type {boolean}
     */
    snapshot_playing: false,

    // ------------------------------------------------------------------
    //  History mode recalculation (addHistoryRecal / historyMode)
    // ------------------------------------------------------------------

    /**
     * User-selected zoom ranges (in absolute axis units) for the growth-
     * rate and frequency figures.  Stored here so the "Recalculate" button
     * can pass them back to historyMode() as fractional intervals.
     * @type {{growthRate: number[]|undefined, frequency: number[]|undefined}}
     */
    hist_mode_range: { growthRate: undefined, frequency: undefined },

    // ------------------------------------------------------------------
    //  Simulation parameters (fetched once from the server via read_para)
    // ------------------------------------------------------------------

    /**
     * Key-value pairs parsed from gtc.out (ndiag, tstep, betae, qion,
     * mmodes, nmodes, mpsi, radial_region, diag_flux, …).
     * @type {Object|undefined}
     */
    basicParameters: undefined,

    // ------------------------------------------------------------------
    //  Snapshot FFT (used by snapshotPoloidal in plot-data-process.js)
    // ------------------------------------------------------------------

    /**
     * Cached FFTW 1D real-to-complex plan, reused across poloidal spectrum
     * calculations for the same snapshot panel.
     * @type {Object|undefined}
     */
    fftPlan: undefined,

    /**
     * Number of rational surfaces detected in the current simulation.
     * Cached so the snapshot spectrum plot can size trace arrays correctly.
     * @type {number}
     */
    rational_surface_count: 0,
};

// Exposed for interactive inspection in the browser console.
// All production code imports `state` directly via ES modules.
window.GTCGlobal = state;

export default state;
