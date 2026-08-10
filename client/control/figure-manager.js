'use strict';

/**
 * Figure lifecycle manager for the GTC Visualization plot page.
 *
 * Orchestrates the core plotting flow:
 *   - `openPanel`      — opens a tab panel, fetches available plot types,
 *                        creates sub-plot buttons, wires special behaviour
 *   - `getDataThenPlot` — fetches plot data, pre-processes it, renders
 *                        Plotly figures
 *   - `cleanPlot` / `cleanPanel` — reset figure wrappers and panel visibility
 *
 * ## Public API
 *
 *   `openPanel`       — called from the bootstrap `load` handler
 *   `getDataThenPlot` — called from the bootstrap `load` handler
 *   `cleanPlot`       — called from the bootstrap `load` handler
 *   `cleanPanel`      — called from the bootstrap `load` handler
 *
 * @module figure-manager
 */

import state from './state.js';
import { callEventTarget } from '../shared/util.js';
import { requestPlotData } from '../shared/api.js';
import {
    getBasicParameters,
    refreshTimeUnitFactor,
    applyTimeUnitToFigures,
} from '../components/units.js';
import {
    ensurePlotRangeControls,
    renderPlotRangeControls,
    refreshPlotRangeControls,
} from '../components/figure-range-controls.js';
import {
    getStatusBar,
    wrap,
    addLoadingIndicator,
} from '../components/status-bar.js';
import { addHistoryRecal } from '../plotting/history-recal.js';
import {
    snapshotPreprocess,
    addSnapshotPlayer,
    snapshotPoloidalPreview,
} from '../plotting/snapshot.js';
import {
    historyMode,
    trackingPlot,
    addSimulationRegion,
} from '../plotting/plot-data-process.js';
import { buildSummaryPage } from '../plotting/summary-generate.js';
import { createPlotConfig } from '../components/figure-data-download.js';

// ------------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------------

function registerButtons(buttons, cb = getDataThenPlot) {
    buttons.forEach(btn => {
        btn.addEventListener(
            'click',
            wrap(addLoadingIndicator(callEventTarget(cb)))
        );
    });
}

// ------------------------------------------------------------------
//  Panel / figure lifecycle
// ------------------------------------------------------------------

/**
 * Remove all figures from the figure wrapper, clearing canvases.
 */
export function cleanPlot() {
    for (let div of document.getElementById('figure-wrapper').children) {
        div.classList.remove('active');
        if (div.firstElementChild?.tagName === 'CANVAS') {
            div.className = ''; // ensures subsequent Plotly.react works properly
            div.removeChild(div.firstElementChild);
        }
    }

    state.current_snapshot_figure = undefined;
    renderPlotRangeControls();
}

/**
 * Hide all tab sub-panels and collapse the history recalculate button.
 */
export function cleanPanel() {
    const panel = document.getElementById('panel');
    for (let p of panel.children) {
        p.style.opacity = 0;
        p.style.zIndex = 1;
    }

    const recalculate = panel.querySelector('#History-panel').firstElementChild;
    if (recalculate) {
        recalculate.classList.remove('active');
    }

    const summary = document.querySelector('#container');
    summary.style.display = 'none';
}

// ------------------------------------------------------------------
//  Panel opening
// ------------------------------------------------------------------

/**
 * Open a plot-type panel (or snapshot file), fetch available sub-plots
 * from the server, and create the corresponding buttons.
 *
 * `this` is bound to the triggering DOM element (tab radio or snapshot
 * file button).
 *
 * @param {boolean} [clean_beforehand=true]
 */
export async function openPanel(clean_beforehand = true) {
    if (this.id == 'Summary') {
        await buildSummaryPage(openPanel);
        return;
    }

    // link radio id to panel id
    let majorType = this.id.startsWith('snap') ? 'Snapshot' : this.id;
    let panelName = `${majorType}-panel`;

    // modifies status bar
    const statusBar = getStatusBar();

    cleanPanel();
    if (clean_beforehand) {
        cleanPlot();
    }
    let panel = document.getElementById(panelName);
    panel.style.opacity = 1;
    panel.style.zIndex = 2;
    state.activePanel = panel;
    ensurePlotRangeControls(panel);

    // inform the server about which .out file should be parsed
    let {
        info,
        warn,
        err,
        id: btn_id_array,
    } = await (await requestPlotData(`plotType/${this.id}`)).json();

    statusBar.info = info ? info : '';
    statusBar.warn = warn ? warn : '';
    if (err) {
        statusBar.err = err;
        return;
    }

    // wait for the response, then create buttons for plotting
    await getBasicParameters();

    // add buttons
    const node =
        this.localName === 'input'
            ? this.parentNode
            : this.parentNode.parentNode;
    if (node.visited) {
        return;
    } else {
        node.visited = true;
    }

    // Equilibrium panel needs special care
    if (this.id === 'Equilibrium') {
        let { x, y, poloidalPlane, others } = btn_id_array;
        btn_id_array = [poloidalPlane, others];
        createEqPanel1D(x, y);
    }

    // group is array of strings used as button id
    const create_l1_group = (group, cb) => {
        let subDiv = document.createElement('div');
        const btns = group.map(btnID => {
            let btn = document.createElement('button');
            btn.setAttribute('id', `${majorType}-${btnID}`);
            btn.setAttribute('class', 'tab-l1-btn');
            btn.innerText = btnID;
            subDiv.appendChild(btn);

            return btn;
        });
        registerButtons(btns, cb);
        return subDiv;
    };
    btn_id_array.forEach(group => {
        panel.appendChild(create_l1_group(group));
    });

    if (this.id === 'History') {
        addHistoryRecal(panel);
    }

    if (this.id.startsWith('snap')) {
        addSnapshotPlayer(panel, create_l1_group, openPanel, getDataThenPlot);

        panel.querySelectorAll('button').forEach(btn => {
            if (btn.id.endsWith('-poloidal')) {
                btn.classList.add('can-preview');
                btn.addEventListener(
                    'mouseenter',
                    wrap(async () => {
                        document.querySelector(
                            '#poloidal-preview'
                        ).style.display = 'initial';
                        const res = await requestPlotData(`data/${btn.id}`);
                        await snapshotPoloidalPreview(await res.json());
                    })
                );
                btn.addEventListener('mouseleave', ev => {
                    document.querySelector('#poloidal-preview').style.display =
                        'none';
                });
            }
        });
    }
}

// ------------------------------------------------------------------
//  Figure data fetching & rendering
// ------------------------------------------------------------------

/**
 * Fetch plot data from the server, apply time-unit rescaling,
 * run type-specific pre-processing, and render Plotly figures.
 *
 * `this` is bound to the sub-plot button element.
 *
 * @param {boolean} [clean_beforehand=true]
 */
export async function getDataThenPlot(clean_beforehand = true) {
    if (clean_beforehand) {
        cleanPlot();
    }

    await refreshTimeUnitFactor();

    const res = await requestPlotData(`data/${this.id}`, {
        query: state.snapshot_playing ? '&snapshot_playing' : '',
    });
    let figures = await res.json();
    state.current_plot_btn = this;

    // apply currently selected time unit to figures before plotting / postprocessing
    applyTimeUnitToFigures(this.id, figures);

    // some figures need some local calculation
    const recalculate =
        document.getElementById('History-panel').firstElementChild;
    if (this.id.startsWith('History')) {
        recalculate.classList.remove('active');
    }
    if (this.id.startsWith('History') && this.id.includes('-mode')) {
        await historyMode(figures);
        state.hist_mode_range.frequency = undefined;
        state.hist_mode_range.growthRate = undefined;
        recalculate.classList.add('active');
    } else if (this.id.startsWith('Snapshot')) {
        await snapshotPreprocess(this, figures);
    } else if (this.id.startsWith('Tracking')) {
        await trackingPlot(figures);
        [1, 2].forEach(i => {
            document.getElementById(`figure-${i}`).classList.add('active');
        });
        refreshPlotRangeControls();
        return;
    } else if (this.id.startsWith('Equilibrium-1D-rg_n')) {
        figures.forEach(fig => {
            addSimulationRegion(fig);
        });
    }

    await Promise.all(
        figures.map(({ data, layout, force_redraw }, idx) => {
            const fig_div = document.querySelector(`#figure-${idx + 1}`);
            fig_div.classList.add('active');
            // restore height
            if (layout.height === undefined) {
                layout.height = 450;
            }
            return data
                ? (force_redraw ? Plotly.newPlot : Plotly.react)(
                      fig_div,
                      data,
                      layout,
                      createPlotConfig({
                          editable: true,
                      })
                  )
                : Promise.resolve();
        })
    );

    refreshPlotRangeControls();
}

// ------------------------------------------------------------------
//  Equilibrium 1D form
// ------------------------------------------------------------------

function createEqPanel1D(xDataTypes, yDataTypes) {
    const xDiv = document.getElementById('eq-x');
    const yDiv = document.getElementById('eq-y');

    // add x group radio buttons
    xDataTypes.forEach(xData => {
        let input = document.createElement('input');
        Object.assign(input, {
            id: `x-${xData}`,
            value: xData,
            type: 'radio',
            name: 'x',
            className: 'eq-1d-x',
        });

        let label = document.createElement('label');
        label.setAttribute('for', `x-${xData}`);
        label.innerText = xData;

        xDiv.appendChild(input);
        xDiv.appendChild(label);
    });

    // add y group radio buttons
    yDataTypes.forEach(yData => {
        let input = document.createElement('input');
        Object.assign(input, {
            id: `y-${yData}`,
            value: yData,
            type: 'radio',
            name: 'y',
            className: 'eq-1d-y',
        });

        let label = document.createElement('label');
        label.setAttribute('for', `y-${yData}`);
        label.innerText = yData;

        yDiv.appendChild(input);
        yDiv.appendChild(label);
    });

    // register form submit behaviour
    const form = document.getElementById('Equilibrium-panel').firstElementChild;
    form.addEventListener(
        'submit',
        wrap(async e => {
            e.preventDefault();

            const data = new FormData(form);
            const type = 'Equilibrium';

            const xType = data.get('x');
            const yType = data.get('y');

            if (!xType || !yType) {
                alert('Choose X and Y');
                return;
            }

            await addLoadingIndicator(
                getDataThenPlot.bind({
                    id: `${type}-1D-${xType}-${yType}`,
                })
            )();
        })
    );
}
