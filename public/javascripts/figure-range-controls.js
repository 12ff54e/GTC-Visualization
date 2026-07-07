'use strict';

/**
 * Figure range controls for the GTC Visualization plot page.
 *
 * Each plot panel contains a collapsible "Figure Range" section that lets
 * users inspect and manually set the x/y axis ranges of the currently
 * visible Plotly figures.  Two-way sync is maintained:
 *   - Typing values → Apply → Plotly.relayout()
 *   - Zoom/pan on a figure → plotly_relayout event → input fields update
 *
 * The module also feeds the zoomed range of history-mode growth-rate and
 * frequency figures back into `state.hist_mode_range` so the "Recalculate"
 * button can use the user-selected window.
 *
 * ## Public API
 *
 *   `ensurePlotRangeControls(panel)`  — create the container if missing
 *   `renderPlotRangeControls(panel)`  — (re)build range forms for visible figures
 *   `refreshPlotRangeControls()`       — render + sync inputs from Plotly state
 *
 * @module figure-range-controls
 */

import state from './state.js';

// ------------------------------------------------------------------
//  DOM helpers
// ------------------------------------------------------------------

/** @returns {HTMLElement[]} Currently visible figure divs that have data. */
function getVisibleFigureDivs() {
    return [...document.getElementById('figure-wrapper').children].filter(
        figure => figure.classList.contains('active') && figure.data?.length
    );
}

// ------------------------------------------------------------------
//  Plotly axis helpers
// ------------------------------------------------------------------

/**
 * Return the axis layout object for a figure.  Plotly mutates
 * `figure.layout` on zoom/pan, so the live range is always available
 * without reaching for internal properties like `_fullLayout`.
 *
 * @param {HTMLElement} figure - A Plotly figure container div.
 * @param {'x'|'y'} axisName
 * @returns {Object|undefined}
 */
function getFigureAxisLayout(figure, axisName) {
    return figure?.layout?.[`${axisName}axis`];
}

/**
 * Return the current numeric axis range `[min, max]`, or `undefined` if
 * the axis is not yet initialised or has non-finite values.
 *
 * @param {HTMLElement} figure
 * @param {'x'|'y'} axisName
 * @returns {[number, number]|undefined}
 */
function getFigureAxisRange(figure, axisName) {
    const range = getFigureAxisLayout(figure, axisName)?.range;
    if (
        Array.isArray(range) &&
        range.length === 2 &&
        range.every(value => Number.isFinite(Number(value)))
    ) {
        return range.map(Number);
    }
}

// ------------------------------------------------------------------
//  Value formatting
// ------------------------------------------------------------------

/**
 * Format a numeric value for display in a range input field.
 * Returns an empty string for non-finite values (showing the "auto"
 * placeholder).
 *
 * @param {*} value
 * @returns {string}
 */
function formatRangeValue(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return '';
    }
    return String(Number(numericValue.toPrecision(10)));
}

// ------------------------------------------------------------------
//  Form lookup
// ------------------------------------------------------------------

/**
 * Find the range-control form DOM element associated with a figure.
 *
 * @param {HTMLElement} figure
 * @returns {HTMLFormElement|null}
 */
function getPlotRangeForm(figure) {
    return state.activePanel?.querySelector(
        `.plot-range-form[data-figure-id="${figure.id}"]`
    );
}

// ------------------------------------------------------------------
//  Input ↔ figure sync
// ------------------------------------------------------------------

/**
 * Copy the current axis ranges from a figure back into its range-control
 * input fields.
 *
 * @param {HTMLElement} figure
 */
function syncFigureRangeControlInputs(figure) {
    const form = getPlotRangeForm(figure);
    if (!form) {
        return;
    }

    ['x', 'y'].forEach(axisName => {
        const range = getFigureAxisRange(figure, axisName);
        const minInput = form.querySelector(
            `input[data-axis="${axisName}"][data-bound="min"]`
        );
        const maxInput = form.querySelector(
            `input[data-axis="${axisName}"][data-bound="max"]`
        );

        minInput.value = range ? formatRangeValue(range[0]) : '';
        maxInput.value = range ? formatRangeValue(range[1]) : '';
    });
}

// ------------------------------------------------------------------
//  Relayout event handling
// ------------------------------------------------------------------

/**
 * Extract an axis range from a `plotly_relayout` event data object.
 * Plotly may emit the range as a two-element array or as two separate
 * properties (`xaxis.range[0]` / `xaxis.range[1]`).
 *
 * @param {Object} eventData
 * @param {'x'|'y'} axisName
 * @returns {[number, number]|undefined}
 */
function extractRelayoutRange(eventData, axisName) {
    const key = `${axisName}axis.range`;
    const tuple = eventData?.[key];
    if (
        Array.isArray(tuple) &&
        tuple.length === 2 &&
        tuple.every(value => Number.isFinite(Number(value)))
    ) {
        return tuple.map(Number);
    }

    const minValue = eventData?.[`${key}[0]`];
    const maxValue = eventData?.[`${key}[1]`];
    if (
        Number.isFinite(Number(minValue)) &&
        Number.isFinite(Number(maxValue))
    ) {
        return [Number(minValue), Number(maxValue)];
    }
}

/**
 * When the user zooms a history-mode growth-rate or frequency figure,
 * persist the new x-range in `state.hist_mode_range` so the "Recalculate"
 * button can convert it back to a fractional interval.
 *
 * @param {HTMLElement} figure
 * @param {Object} eventData - The `plotly_relayout` event data.
 */
function updateHistoryModeRangeFromRelayout(figure, eventData) {
    const currentPlotId = state.current_plot_btn?.id;
    if (
        !currentPlotId?.startsWith('History') ||
        !currentPlotId.includes('-mode')
    ) {
        return;
    }

    const targetField =
        figure.id === 'figure-2'
            ? 'growthRate'
            : figure.id === 'figure-3'
              ? 'frequency'
              : undefined;
    if (!targetField) {
        return;
    }

    state.hist_mode_range[targetField] =
        extractRelayoutRange(eventData, 'x') ?? getFigureAxisRange(figure, 'x');
}

/**
 * Bind the `plotly_relayout` event on a figure so that the range-control
 * inputs and (for history-mode figures) `state.hist_mode_range` stay in
 * sync with the visible plot.  Each figure is bound at most once.
 *
 * @param {HTMLElement} figure
 */
function bindFigureRangeSync(figure) {
    if (figure.dataset.rangeSyncBound === 'true') {
        return;
    }

    figure.dataset.rangeSyncBound = 'true';
    figure.on('plotly_relayout', eventData => {
        syncFigureRangeControlInputs(figure);
        updateHistoryModeRangeFromRelayout(figure, eventData);
    });
}

// ------------------------------------------------------------------
//  Form → figure (apply / reset)
// ------------------------------------------------------------------

/**
 * Read the range values from a form and push them to Plotly via
 * `Plotly.relayout()`.  Validates that both bounds are finite numbers
 * with min < max before applying.
 *
 * @param {HTMLElement} figure
 * @param {HTMLFormElement} form
 */
function applyFigureRangeFromForm(figure, form) {
    const updates = {};
    for (const axisName of ['x', 'y']) {
        const currentRange = getFigureAxisRange(figure, axisName);
        const minValue = form.querySelector(
            `input[data-axis="${axisName}"][data-bound="min"]`
        ).value;
        const maxValue = form.querySelector(
            `input[data-axis="${axisName}"][data-bound="max"]`
        ).value;

        if (!minValue && !maxValue) {
            continue;
        }

        const nextMin = minValue ? Number(minValue) : currentRange?.[0];
        const nextMax = maxValue ? Number(maxValue) : currentRange?.[1];
        if (!Number.isFinite(nextMin) || !Number.isFinite(nextMax)) {
            alert(
                `Enter valid numeric ${axisName.toUpperCase()} range values.`
            );
            return;
        }
        if (nextMin >= nextMax) {
            alert(
                `${axisName.toUpperCase()} minimum must be smaller than maximum.`
            );
            return;
        }

        updates[`${axisName}axis.range`] = [nextMin, nextMax];
        updates[`${axisName}axis.autorange`] = false;
    }

    if (!Object.keys(updates).length) {
        return;
    }

    Plotly.relayout(figure, updates).then(() =>
        syncFigureRangeControlInputs(figure)
    );
}

/**
 * Reset a figure to auto-range on both axes.
 *
 * @param {HTMLElement} figure
 */
function resetFigureAutoRange(figure) {
    Plotly.relayout(figure, {
        'xaxis.autorange': true,
        'yaxis.autorange': true,
    }).then(() => syncFigureRangeControlInputs(figure));
}

// ------------------------------------------------------------------
//  DOM creation
// ------------------------------------------------------------------

/**
 * Create a single range input field (label + text input).
 *
 * @param {'x'|'y'} axisName
 * @param {'min'|'max'} bound
 * @param {number|undefined} value - Initial value (or undefined for auto).
 * @returns {HTMLLabelElement}
 */
function createPlotRangeField(axisName, bound, value) {
    const label = document.createElement('label');
    label.className = 'plot-range-field';

    const text = document.createElement('span');
    text.innerText = `${axisName.toUpperCase()} ${bound}`;

    const input = document.createElement('input');
    Object.assign(input, {
        type: 'text',
        value: value === undefined ? '' : formatRangeValue(value),
        placeholder: 'auto',
        autocomplete: 'off',
    });
    input.dataset.axis = axisName;
    input.dataset.bound = bound;

    label.append(text, input);
    return label;
}

/**
 * Build the range-control form for a single figure.
 *
 * @param {HTMLElement} figure
 * @returns {HTMLFormElement}
 */
function createPlotRangeForm(figure) {
    const form = document.createElement('form');
    form.className = 'plot-range-form';
    form.dataset.figureId = figure.id;

    const title = document.createElement('div');
    title.className = 'plot-range-title';
    title.innerText = figure.id.replace('figure-', 'Figure ');

    const grid = document.createElement('div');
    grid.className = 'plot-range-grid';
    const xRange = getFigureAxisRange(figure, 'x');
    const yRange = getFigureAxisRange(figure, 'y');
    grid.append(
        createPlotRangeField('x', 'min', xRange?.[0]),
        createPlotRangeField('x', 'max', xRange?.[1]),
        createPlotRangeField('y', 'min', yRange?.[0]),
        createPlotRangeField('y', 'max', yRange?.[1])
    );

    const actions = document.createElement('div');
    actions.className = 'plot-range-actions';

    const applyButton = document.createElement('button');
    applyButton.type = 'submit';
    applyButton.className = 'tab-l1-btn';
    applyButton.innerText = 'Apply';

    const autoButton = document.createElement('button');
    autoButton.type = 'button';
    autoButton.className = 'tab-l1-btn';
    autoButton.innerText = 'Auto';
    autoButton.addEventListener('click', () => resetFigureAutoRange(figure));

    actions.append(applyButton, autoButton);
    form.append(title, grid, actions);
    form.addEventListener('submit', event => {
        event.preventDefault();
        applyFigureRangeFromForm(figure, form);
    });

    return form;
}

// ------------------------------------------------------------------
//  Container management
// ------------------------------------------------------------------

/**
 * Expand or collapse the range-controls container.
 *
 * @param {HTMLElement} container - The `.plot-range-controls` element.
 * @param {boolean} expanded
 */
function setPlotRangeControlsExpanded(container, expanded) {
    container.classList.toggle('active', expanded);
    const toggle = container.querySelector('.plot-range-toggle');
    toggle.setAttribute('aria-expanded', expanded);
}

// ------------------------------------------------------------------
//  Public API
// ------------------------------------------------------------------

/**
 * Ensure the collapsible "Figure Range" controls container exists inside
 * `panel`.  If it already exists the existing element is returned.
 * Initially collapsed.
 *
 * @param {HTMLElement} panel - The tab panel (e.g. History-panel).
 * @returns {HTMLElement} The `.plot-range-controls` container.
 */
export function ensurePlotRangeControls(panel) {
    let container = panel.querySelector('.plot-range-controls');
    if (container) {
        return container;
    }

    container = document.createElement('div');
    container.className = 'plot-range-controls';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'plot-range-toggle';
    toggle.innerText = 'Figure Range';
    toggle.addEventListener('click', () => {
        setPlotRangeControlsExpanded(
            container,
            !container.classList.contains('active')
        );
    });

    const body = document.createElement('div');
    body.className = 'plot-range-controls-body';

    container.append(toggle, body);
    setPlotRangeControlsExpanded(container, false);
    panel.appendChild(container);
    return container;
}

/**
 * (Re)build the range-control forms for every visible figure that has
 * both x and y axes initialised.  If no figures are available a
 * placeholder message is shown instead.
 *
 * @param {HTMLElement} [panel] - Defaults to `state.activePanel`.
 */
export function renderPlotRangeControls(panel = state.activePanel) {
    if (!panel) {
        return;
    }

    const body = ensurePlotRangeControls(panel).querySelector(
        '.plot-range-controls-body'
    );
    body.replaceChildren();

    const figures = getVisibleFigureDivs().filter(
        figure =>
            getFigureAxisLayout(figure, 'x') && getFigureAxisLayout(figure, 'y')
    );
    if (!figures.length) {
        const placeholder = document.createElement('p');
        placeholder.className = 'plot-range-empty';
        placeholder.innerText = 'Plot a figure to set its x/y range here.';
        body.appendChild(placeholder);
        return;
    }

    figures.forEach(figure => {
        bindFigureRangeSync(figure);
        body.appendChild(createPlotRangeForm(figure));
    });
}

/**
 * Refresh all range controls: re-render the forms for the active panel,
 * then sync every visible figure's input fields from the live Plotly
 * axis ranges.
 */
export function refreshPlotRangeControls() {
    renderPlotRangeControls(state.activePanel);
    getVisibleFigureDivs().forEach(syncFigureRangeControlInputs);
}
