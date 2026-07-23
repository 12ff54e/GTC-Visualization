'use strict';

/**
 * History-mode "Recalculate" button.
 *
 * Adds a button to the History panel that re-fits the growth rate and
 * frequency using the user-selected zoom range (stored in
 * `state.hist_mode_range`) and re-renders the affected figures.
 *
 * @module history-recal
 */

import state from '../control/state.js';
import { wrap } from '../components/status-bar.js';
import { historyMode } from './plot-data-process.js';
import { refreshPlotRangeControls } from '../components/figure-range-controls.js';

/**
 * Append the "Recalculate growth rate and frequency" button to `panel`.
 *
 * @param {HTMLElement} panel - The History sub-panel container.
 */
export function addHistoryRecal(panel) {
    const div = document.createElement('div');
    const btn = document.createElement('button');
    btn.innerText =
        'Recalculate\ngrowth rate and frequency\naccording to zoomed range';
    btn.classList.add('tab-l1-btn');
    btn.addEventListener(
        'click',
        wrap(async function () {
            const figures = [1, 2, 3, 4].map(i =>
                document.getElementById(`figure-${i}`)
            );
            const len = figures[0].data[0].x[figures[0].data[0].x.length - 1];
            await historyMode(
                figures,
                state.hist_mode_range.growthRate &&
                    state.hist_mode_range.growthRate.map(i => i / len),
                state.hist_mode_range.frequency &&
                    state.hist_mode_range.frequency.map(i => i / len)
            );

            figures.forEach(figure => {
                Plotly.react(figure, figure.data, figure.layout);
            });
            refreshPlotRangeControls();
        })
    );

    div.classList.add('dropdown');
    div.style['overflow'] = 'hidden';
    div.append(btn);
    panel.prepend(div);
}
