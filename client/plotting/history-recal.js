'use strict';

/**
 * History growth-rate "Recalculate" button.
 *
 * Adds a button to the History panel that re-fits the growth rate and
 * mode frequency or phi-RMS growth rate using the range selected on the
 * corresponding x-axis range slider, then re-renders the affected figures.
 *
 * @module history-recal
 */

import state from '../control/state.js';
import { themedPlot } from '../shared/plot-theme.js';
import { wrap } from '../components/status-bar.js';
import { historyMode, historyPhiRms } from './plot-data-process.js';
import { refreshPlotRangeControls } from '../components/figure-range-controls.js';

/** Keep the recalculation control visible after its normal position scrolls away. */
export function updateHistoryRecalPosition(anchor, control) {
    control.classList.toggle(
        'history-recalculate-pinned',
        anchor.getBoundingClientRect().top <= 20
    );
}

/**
 * Append the History recalculation button to `panel`.
 *
 * @param {HTMLElement} panel - The History sub-panel container.
 */
export function addHistoryRecal(panel) {
    const div = document.createElement('div');
    div.id = 'history-recalculate';
    const btn = document.createElement('button');
    btn.innerText = 'Recalculate growth rate for selected range';
    btn.classList.add('tab-l1-btn');
    btn.addEventListener(
        'click',
        wrap(async function () {
            if (state.current_plot_btn?.id === 'History-phi-RMS') {
                const figure = document.getElementById('figure-4');
                const len = figure.data[0].x.at(-1);
                const interval = state.hist_phi_rms_range?.map(
                    value => value / len
                );
                historyPhiRms(
                    figure,
                    interval,
                    state.hist_phi_rms_base_title
                );
                themedPlot.react(figure, figure.data, figure.layout);
                refreshPlotRangeControls();
                return;
            }

            btn.innerText =
                'Recalculate\ngrowth rate and frequency\nfor selected range';

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
                themedPlot.react(figure, figure.data, figure.layout);
            });
            refreshPlotRangeControls();
        })
    );

    div.classList.add('dropdown');
    div.style['overflow'] = 'hidden';
    div.append(btn);

    const anchor = document.createElement('div');
    anchor.classList.add('history-recalculate-anchor');
    const updatePosition = () => updateHistoryRecalPosition(anchor, div);

    panel.append(anchor);
    panel.append(div);
    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition);
    updatePosition();
}
