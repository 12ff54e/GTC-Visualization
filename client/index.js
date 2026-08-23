'use strict';

/**
 * Bootstrap entry point for the GTC Visualization plot page.
 *
 * Imports all modules and wires the `load` event handler — registering
 * tab switches, snapshot buttons, the unit chooser, download form, and
 * breadcrumb navigation.  All figure lifecycle logic is delegated to
 * {@link module:figure-manager}.
 *
 * @module index
 */

import state from './control/state.js';
import { callEventTarget } from './shared/util.js';
import { refreshTimeUnitFactor, TIME_UNIT_LABEL } from './components/units.js';
import {
    openPanel,
    getDataThenPlot,
    cleanPlot,
    cleanPanel,
} from './control/figure-manager.js';
import {
    StatusBar,
    getStatusBar,
    wrap,
    addLoadingIndicator,
} from './components/status-bar.js';
import { setupBreadcrumbs } from './components/navigation.js';
import { setupDownloadForm } from './components/download.js';
import {
    getVisibleFigureDivs,
    getFigureAxisLayout,
    getFigureAxisRange,
    getDisplayedHistoryModeIntervals,
    refreshPlotRangeControls,
} from './components/figure-range-controls.js';

// ------------------------------------------------------------------
//  Bootstrap
// ------------------------------------------------------------------

window.addEventListener('load', () => {
    new StatusBar(document.getElementById('status'));

    // ---- unit chooser ------------------------------------------------
    const unitToggleButton = document.getElementById('units-toggle-button');
    const unitChooser = document.getElementById('unit-chooser');
    unitToggleButton.addEventListener('click', e => {
        e.preventDefault();
        unitChooser.classList.toggle('active');
    });

    const timeUnitSelect = document.getElementById('time-unit-select');
    timeUnitSelect.addEventListener(
        'change',
        wrap(async e => {
            // Capture the current time-axis range on each visible figure so
            // we can restore the user's chosen window after the figures are
            // replotted in the new unit. We identify time-axis figures by
            // their x-axis title text matching a known time-unit label.
            const oldUnit = state.units.time;
            const oldFactor = state.timeUnitFactor?.[oldUnit] ?? 1;
            const timeUnitLabels = new Set(Object.values(TIME_UNIT_LABEL));
            const previousRanges = getVisibleFigureDivs()
                .filter(fig => {
                    const titleText =
                        getFigureAxisLayout(fig, 'x')?.title?.text;
                    return timeUnitLabels.has(titleText);
                })
                .map(fig => ({
                    id: fig.id,
                    range: getFigureAxisRange(fig, 'x'),
                }))
                .filter(entry => entry.range);
            const currentPlotId = state.current_plot_btn?.id;
            state.pendingHistoryModeIntervals =
                currentPlotId?.startsWith('History') &&
                currentPlotId.includes('-mode')
                    ? getDisplayedHistoryModeIntervals()
                    : undefined;

            state.units.time = e.target.value;
            await refreshTimeUnitFactor();

            if (state.current_plot_btn) {
                await addLoadingIndicator(
                    getDataThenPlot.bind(state.current_plot_btn)
                )();

                const newFactor =
                    state.timeUnitFactor?.[e.target.value] ?? 1;
                const ratio = newFactor / oldFactor;
                if (
                    Number.isFinite(ratio) &&
                    ratio !== 0 &&
                    ratio !== 1
                ) {
                    await Promise.all(
                        previousRanges.map(({ id, range }) => {
                            const fig = document.getElementById(id);
                            if (!fig) return Promise.resolve();
                            return Plotly.relayout(fig, {
                                'xaxis.range': [
                                    range[0] * ratio,
                                    range[1] * ratio,
                                ],
                                'xaxis.autorange': false,
                            });
                        })
                    );
                    refreshPlotRangeControls();
                }
            }
        })
    );

    // ---- plot-type tabs ----------------------------------------------
    for (let swc of document.getElementsByClassName('tab-l0-switch')) {
        swc.visited = false;
        const div = document.getElementById('files');
        if (swc.id === 'Snapshot') {
            swc.addEventListener('change', e => {
                div.classList.add('active');
                cleanPlot();
                cleanPanel();
            });
        } else {
            swc.addEventListener(
                'change',
                wrap(async e => {
                    div.classList.remove('active');
                    for (const btn of div.children) {
                        btn.classList.remove('snapshot-selected');
                    }
                    await addLoadingIndicator(callEventTarget(openPanel))(e);
                })
            );
        }
        swc.disabled = false;
    }

    // ---- snapshot file-name buttons ----------------------------------
    for (let btn of document.getElementById('files').children) {
        btn.addEventListener(
            'click',
            wrap(async e => {
                for (let b of e.target.parentElement.children) {
                    b.classList.remove('snapshot-selected');
                }
                e.target.classList.add('snapshot-selected');
                state.current_snapshot = e.target;
                await addLoadingIndicator(callEventTarget(openPanel))(e);
            })
        );
    }

    // ---- download form + breadcrumbs ---------------------------------
    setupDownloadForm();
    setupBreadcrumbs();
});

// ------------------------------------------------------------------
//  Global error fallback
// ------------------------------------------------------------------

window.addEventListener('error', () => {
    getStatusBar().err = StatusBar.DEFAULT_ERROR;
});
