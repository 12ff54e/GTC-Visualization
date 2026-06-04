'use strict';
import {
    historyMode,
    snapshotPoloidal,
    snapshotPoloidalPreview,
    snapshotSpectrum,
    trackingPlot,
    addSimulationRegion,
} from './plot-data-process.js';
import { generateSummary } from './summary-generate.js';

// status bar on top
class StatusBar {
    constructor(root) {
        this.parent = root;
        root.status = this;
    }
    toString() {
        return (
            (this.information
                ? `<font color="green">${this.information}</font><br>`
                : '') +
            (this.warning
                ? `<font color="darkYellow">${this.warning}</font><br>`
                : '') +
            (this.error ? `<font color="red">${this.error}</font><br>` : '')
        );
    }
    show() {
        this.parent.innerHTML = this;
    }
    /**
     * @param {string} i
     */
    set info(i) {
        this.information = i;
        this.show();
    }
    /**
     * @param {string} w
     */
    set warn(w) {
        this.warning = w;
        this.show();
    }
    /**
     * @param {string} e
     */
    set err(e) {
        this.error = e;
        this.show();
    }
}
Object.defineProperty(StatusBar, 'DEFAULT_ERROR', {
    value: 'Oops, something wrong happened. Please check javascript console for more info.',
    writable: false,
    enumerable: true,
    configurable: false,
});

function getStatusBar() {
    return document.querySelector('#status').status;
}

// global vars
//  {
//      hist_mode_range;
//      basicParameters;
//      timeStep;
//      current_snapshot_id;
//      current_snapshot_figure_id;
//  }
window.GTCGlobal = new Object();
window.GTCGlobal.units = { time: 'R0Cs' };
window.GTCGlobal.timeUnitFactor = { R0Cs: 1, R0Va: 1, tstep: 1, microsecond: 1 };
window.GTCGlobal.activePanel = undefined;

// use for history mode interaction
window.GTCGlobal.hist_mode_range = {
    growthRate: undefined,
    frequency: undefined,
};

window.addEventListener('load', () => {
    new StatusBar(document.getElementById('status'));

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
            const oldUnit = window.GTCGlobal.units.time;
            const oldFactor =
                window.GTCGlobal.timeUnitFactor?.[oldUnit] ?? 1;
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

            window.GTCGlobal.units.time = e.target.value;
            await refreshTimeUnitFactor();

            if (window.GTCGlobal.current_plot_btn) {
                await addLoadingIndicator(
                    getDataThenPlot.bind(window.GTCGlobal.current_plot_btn)
                )();

                const newFactor =
                    window.GTCGlobal.timeUnitFactor?.[e.target.value] ?? 1;
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

    // register plot type tabs
    for (let swc of document.getElementsByClassName('tab-l0-switch')) {
        swc.visited = false;
        const div = document.getElementById('files');
        if (swc.id === 'Snapshot') {
            swc.addEventListener('change', e => {
                // expand snapshot file list
                div.classList.add('active');
                cleanPlot();
                cleanPanel();
            });
        } else {
            swc.addEventListener(
                'change',
                wrap(async e => {
                    // collapse snapshot file list
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

    // snapshot file name buttons
    for (let btn of document.getElementById('files').children) {
        btn.addEventListener(
            'click',
            wrap(async e => {
                for (let b of e.target.parentElement.children) {
                    b.classList.remove('snapshot-selected');
                }
                e.target.classList.add('snapshot-selected');
                // set current snapshot file
                window.GTCGlobal.current_snapshot = e.target;
                await addLoadingIndicator(callEventTarget(openPanel))(e);
            })
        );
    }

    addDownloadFunction();

    // initial breadcrumb
    const navi_segments = [
        ...document.querySelector('#breadcrumb-container').children,
    ];
    const clearDropdown = exception => {
        navi_segments.forEach(s => {
            if (s === exception) {
                return;
            }
            s.classList.remove('active');
            for (const child of s.children) {
                child.classList.remove('active');
            }
        });
    };
    wrap(async () => {
        const res = await fetch('/fileTree');
        await propagateFetchError(res);
        const { file_tree } = await res.json();

        const constructPath = entry => {
            return entry
                ? `${constructPath(entry.parent)}/${entry.dirname}`
                : '';
        };

        // add drop down list
        const constructFolderContentList = (parent, child) => {
            const ul = document.createElement('ul');

            if (parent === undefined) {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = '/';
                a.innerText = '(Go Back to File Tree View)';
                li.classList.add('breadcrumb-dropdown-item');
                li.appendChild(a);
                ul.appendChild(li);
                return ul;
            }

            for (const entry of parent.content) {
                if (typeof entry === 'string') {
                    continue;
                }
                entry.parent = parent;
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.innerText = entry.dirname;
                li.appendChild(a);

                li.classList.add('breadcrumb-dropdown-item');
                if (child?.dirname === entry.dirname) {
                    li.classList.add('current-item');
                }

                if (entry.mTimeMs) {
                    // a gtc output folder
                    a.addEventListener('click', () => {
                        postForm('/plot', { gtc_output: constructPath(entry) });
                    });
                    const span = document.createElement('span');
                    span.innerText = 'gtc.out';
                    span.classList.add('output');
                    li.appendChild(span);
                }

                if (entry.count.folders > 1) {
                    // a folder contains subfolders
                    li.classList.add('folder');
                    li.appendChild(constructFolderContentList(entry));
                    li.addEventListener('click', event => {
                        event.stopPropagation();
                        event.currentTarget.classList.toggle('folder-expand');
                    });
                }
                ul.appendChild(li);
            }

            return ul;
        };

        let currentEntry = undefined;
        navi_segments.forEach((seg, idx) => {
            // first span is the copy button
            if (idx == 0) {
                return;
            }
            const parentEntry = currentEntry;
            currentEntry = currentEntry
                ? currentEntry.content.find(
                      f => f.dirname === seg.firstElementChild.innerText
                  )
                : file_tree;

            seg.lastElementChild.append(
                constructFolderContentList(parentEntry, currentEntry)
            );
            seg.addEventListener('click', event => {
                clearDropdown(event.currentTarget);
                for (const child of event.currentTarget.children) {
                    child.classList.toggle('active');
                }
            });
        });
        // clear dropdown when clicked on other parts on the page
        document.addEventListener('click', event => {
            if (
                !nodeIs(event.target, elem =>
                    elem.classList.contains('breadcrumb-item')
                )
            ) {
                clearDropdown();
            }
        });
    })();

    // button for copy path
    document.getElementById('copy-path').addEventListener(
        'click',
        wrap(async ev => {
            const path = document.getElementById('entry-path').innerText;
            if (!navigator.clipboard) {
                clearDropdown();
                const div = ev.target.nextElementSibling;
                div.classList.toggle('active');
                if (window.getSelection) {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(div.firstElementChild);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
                return;
            }
            await navigator.clipboard.writeText(path);
            const btn = ev.target;
            const icon = btn.innerText;
            btn.innerText = 'check';
            btn.disabled = true;
            setTimeout(() => {
                btn.innerText = icon;
                btn.disabled = false;
            }, 500);
        })
    );
});

window.addEventListener('error', () => {
    getStatusBar().err = StatusBar.DEFAULT_ERROR;
});

// wrap async function for error handling
function wrap(func) {
    return (...args) =>
        func(...args).catch(err => {
            console.log(err);
            getStatusBar().err = StatusBar.DEFAULT_ERROR;
        });
}

function callEventTarget(func, transform = e => e.target) {
    return e => func.call(transform(e));
}

function addDownloadFunction() {
    // add GTC output file download cb
    const downloadForm = document.querySelector('#download-output');
    // button for expand/collapse file list
    downloadForm.querySelector('button').addEventListener('click', e => {
        e.preventDefault();
        e.target.nextSibling.classList.toggle('select-show');
    });
    // submit file list for download
    downloadForm.querySelectorAll('input').forEach(btn =>
        btn.addEventListener(
            'click',
            wrap(async e => {
                e.preventDefault();
                const loading = downloadForm.querySelector('#download-overlay');
                loading.style.visibility = 'initial';
                const url = `/plot/data/download?dir=${
                    document.querySelector('#output-tag').innerText
                }${e.target.id.endsWith('all') ? '&all' : ''}`;

                const data = new URLSearchParams();
                for (const [key, val] of new FormData(downloadForm).entries()) {
                    data.append(key, val);
                }

                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/x-www-form-urlencoded',
                    },
                    body: data,
                });
                if (!res.ok) {
                    console.error('File download failed');
                    throw `Server return ${res.status}:${res.statusText} upon requesting GTC output files`;
                }
                const blob = await res.blob();

                // create link for downloading file
                const a = document.body.appendChild(
                    document.createElement('a')
                );
                a.href = window.URL.createObjectURL(blob);

                // forward filename, if exist
                let match;
                if (
                    (match = res.headers
                        .get('Content-Disposition')
                        .match(/filename="(.*)"/))
                ) {
                    a.download = match[1];
                }
                a.click();
                a.remove();
                loading.style.visibility = 'hidden';
            })
        )
    );
}

function registerButtons(buttons, cb = getDataThenPlot) {
    buttons.forEach(btn => {
        btn.addEventListener(
            'click',
            wrap(addLoadingIndicator(callEventTarget(cb)))
        );
    });
}

async function getBasicParameters() {
    if (!window.GTCGlobal.basicParameters) {
        const res = await requestPlotData('data/basicParameters');
        window.GTCGlobal.basicParameters = await res.json();
    }
}

async function refreshTimeUnitFactor() {
    await getBasicParameters();
    const bp = window.GTCGlobal.basicParameters;
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

    window.GTCGlobal.timeUnitFactor = {
        R0Cs: 1,
        R0Va: vaOverCs,
        tstep: 1 / bp.tstep,
        // `bp.tstep_seconds` is the SI duration (seconds) of ONE simulation
        // step, parsed from the line "tstep in seconds: ..." in gtc.out.
        // The base time axis unit (when `R0Cs` is selected) advances by
        // `bp.ndiag * bp.tstep` per data point, so to convert from base
        // unit -> microseconds we multiply by
        //     (bp.tstep_seconds / bp.tstep) * 1e6
        // Fall back to 0 if `tstep_seconds` is unavailable.
        microsecond:
            typeof bp.tstep_seconds === 'number' && bp.tstep_seconds > 0
                ? (bp.tstep_seconds / bp.tstep) * 1e6
                : 0,
    };
    window.GTCGlobal.timeStep =
        baseTimeStep * window.GTCGlobal.timeUnitFactor[window.GTCGlobal.units.time];
}

const TIME_UNIT_LABEL = {
    R0Cs: '$R_0/c_s$',
    R0Va: '$R_0/v_A$',
    tstep: '$tstep$',
    microsecond: '$\\mu s$',
};

/**
 * Apply the currently selected time unit to figures returned by the
 * backend. The server always returns time-axis data in the base unit
 * `R_0/c_s` (with axis label `$R_0/c_s$` for History and
 * `$\\text{time step}$` for RadialTime). This function rescales the
 * x-axis values and updates the x-axis labels accordingly.
 *
 * @param {string} plotId
 * @param {Array<Object>} figures
 */
function applyTimeUnitToFigures(plotId, figures) {
    const unit = window.GTCGlobal.units?.time || 'R0Cs';
    const factor = window.GTCGlobal.timeUnitFactor?.[unit] ?? 1;
    const label = TIME_UNIT_LABEL[unit] || TIME_UNIT_LABEL.R0Cs;

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
            window.GTCGlobal.basicParameters.ndiag *
            window.GTCGlobal.basicParameters.tstep;
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

function getVisibleFigureDivs() {
    return [...document.getElementById('figure-wrapper').children].filter(
        figure => figure.classList.contains('active') && figure.data?.length
    );
}

function getFigureAxisLayout(figure, axisName) {
    return (
        figure?._fullLayout?.[`${axisName}axis`] ??
        figure?.layout?.[`${axisName}axis`]
    );
}

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

function formatRangeValue(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return '';
    }

    return String(Number(numericValue.toPrecision(10)));
}

function getPlotRangeForm(figure) {
    return window.GTCGlobal.activePanel?.querySelector(
        `.plot-range-form[data-figure-id="${figure.id}"]`
    );
}

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
    if (Number.isFinite(Number(minValue)) && Number.isFinite(Number(maxValue))) {
        return [Number(minValue), Number(maxValue)];
    }
}

function updateHistoryModeRangeFromRelayout(figure, eventData) {
    const currentPlotId = window.GTCGlobal.current_plot_btn?.id;
    if (!currentPlotId?.startsWith('History') || !currentPlotId.includes('-mode')) {
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

    window.GTCGlobal.hist_mode_range[targetField] =
        extractRelayoutRange(eventData, 'x') ?? getFigureAxisRange(figure, 'x');
}

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
            alert(`Enter valid numeric ${axisName.toUpperCase()} range values.`);
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

    Plotly.relayout(figure, updates).then(() => syncFigureRangeControlInputs(figure));
}

function resetFigureAutoRange(figure) {
    Plotly.relayout(figure, {
        'xaxis.autorange': true,
        'yaxis.autorange': true,
    }).then(() => syncFigureRangeControlInputs(figure));
}

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

function setPlotRangeControlsExpanded(container, expanded) {
    container.classList.toggle('active', expanded);
    const toggle = container.querySelector('.plot-range-toggle');
    toggle.setAttribute('aria-expanded', expanded);
}

function ensurePlotRangeControls(panel) {
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

function renderPlotRangeControls(panel = window.GTCGlobal.activePanel) {
    if (!panel) {
        return;
    }

    const body = ensurePlotRangeControls(panel).querySelector(
        '.plot-range-controls-body'
    );
    body.replaceChildren();

    const figures = getVisibleFigureDivs().filter(
        figure => getFigureAxisLayout(figure, 'x') && getFigureAxisLayout(figure, 'y')
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

function refreshPlotRangeControls() {
    renderPlotRangeControls(window.GTCGlobal.activePanel);
    getVisibleFigureDivs().forEach(syncFigureRangeControlInputs);
}

async function openPanel(clean_beforehand = true) {
    if (this.id == 'Summary') {
        await buildSummaryPage();
        return;
    }

    // link radio id to panel id
    let majorType = this.id.startsWith('snap') ? 'Snapshot' : this.id;
    let panelName = `${majorType}-panel`;

    // modifies status bar
    const statusBar = document.getElementById('status').status;

    cleanPanel();
    if (clean_beforehand) {
        cleanPlot();
    }
    let panel = document.getElementById(panelName);
    panel.style.opacity = 1;
    panel.style.zIndex = 2;
    window.GTCGlobal.activePanel = panel;
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
        addSnapshotPlayer(panel, create_l1_group);

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

async function buildSummaryPage() {
    await getBasicParameters();
    const summary_data = await (await requestPlotData('Summary')).json();
    const summaryContainer = await generateSummary(
        summary_data,
        getStatusBar()
    );

    if (summaryContainer === undefined) {
        // summary page is already generated
        return;
    }

    // register jump button on summary page
    summaryContainer.querySelectorAll('.summary-jump-button').forEach(btn => {
        btn.addEventListener(
            'click',
            wrap(async e => {
                e.preventDefault();
                const panelSwitch = document.querySelector(
                    `#${btn.id.split('-')[1]}`
                );
                await addLoadingIndicator(openPanel.bind(panelSwitch))();

                panelSwitch.checked = true;
                document.querySelector(`#${btn.id.slice(8)}`).click();
            })
        );
    });
}

function addHistoryRecal(panel) {
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
                window.GTCGlobal.hist_mode_range.growthRate &&
                    window.GTCGlobal.hist_mode_range.growthRate.map(
                        i => i / len
                    ),
                window.GTCGlobal.hist_mode_range.frequency &&
                    window.GTCGlobal.hist_mode_range.frequency.map(i => i / len)
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

async function addSnapshotPlayer(panel, create_l1_group) {
    panel.appendChild(
        create_l1_group(
            [
                'previous snapshot',
                'next snapshot',
                'previous (continuously)',
                'next (continuously)',
            ],
            async function () {
                let cont = this.innerText.endsWith('(continuously)');
                const prev = this.innerText.startsWith('prev');
                const stopper = ev => {
                    if (ev.key === 's') {
                        cont = false;
                    }
                };
                window.GTCGlobal.snapshot_playing = true;
                window.addEventListener('keypress', stopper);

                const delay = 300; // shortest possible frame inteval
                // real frame interval might be larger due to network and/or render
                let last_time = document.timeline.currentTime - delay;

                const animate = async timestamp => {
                    if (timestamp - last_time < delay) {
                        requestAnimationFrame(animate);
                        return;
                    }
                    const current_snapshot = GTCGlobal.current_snapshot;
                    if (prev) {
                        if (current_snapshot.previousElementSibling) {
                            GTCGlobal.current_snapshot =
                                current_snapshot.previousElementSibling;
                        } else {
                            if (!cont) {
                                alert('No previous snapshot');
                            }
                            cont = false;
                        }
                    } else {
                        if (current_snapshot.nextElementSibling) {
                            GTCGlobal.current_snapshot =
                                current_snapshot.nextElementSibling;
                        } else {
                            if (!cont) {
                                alert('No next snapshot');
                            }
                            cont = false;
                        }
                    }
                    await openPanel.call(GTCGlobal.current_snapshot, false);
                    if (GTCGlobal.current_snapshot_figure) {
                        await getDataThenPlot.call(
                            GTCGlobal.current_snapshot_figure,
                            false
                        );
                    }
                    current_snapshot.classList.remove('snapshot-selected');
                    GTCGlobal.current_snapshot.classList.add(
                        'snapshot-selected'
                    );

                    last_time = timestamp;
                    if (cont) {
                        requestAnimationFrame(animate);
                    } else {
                        // cleanup
                        window.removeEventListener('keypress', stopper);
                        window.GTCGlobal.snapshot_playing = false;
                    }
                };
                requestAnimationFrame(animate);
            }
        )
    );
}

async function requestPlotData(name, opts) {
    const optional = opts?.optional ?? false;
    const query = opts?.query ?? '';
    const res = await fetch(
        `plot/${name}?dir=${document.querySelector('#output-tag').innerText}${query}`
    );
    try {
        await propagateFetchError(res);
    } catch (e) {
        if (!optional) {
            throw e;
        }
    }
    return res;
}

function cleanPlot() {
    for (let div of document.getElementById('figure-wrapper').children) {
        div.classList.remove('active');
        if (div.firstElementChild?.tagName === 'CANVAS') {
            div.className = ''; // ensures subsequent Plotly.react works properly
            div.removeChild(div.firstElementChild);
        }
    }

    GTCGlobal.current_snapshot_figure = undefined;
    renderPlotRangeControls();
}

function cleanPanel() {
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

function addLoadingIndicator(func) {
    return async (...args) => {
        const loading = document.querySelector('#loading');
        loading.style.visibility = 'visible';

        await func(...args);

        loading.style.visibility = 'hidden';
    };
}

async function getDataThenPlot(clean_beforehand = true) {
    if (clean_beforehand) {
        cleanPlot();
    }

    await refreshTimeUnitFactor();

    const res = await requestPlotData(`data/${this.id}`, {
        query: window.GTCGlobal.snapshot_playing ? '&snapshot_playing' : '',
    });
    let figures = await res.json();
    window.GTCGlobal.current_plot_btn = this;

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
        window.GTCGlobal.hist_mode_range.frequency = undefined;
        window.GTCGlobal.hist_mode_range.growthRate = undefined;
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
                      {
                          editable: true,
                      }
                  )
                : Promise.resolve();
        })
    );

    refreshPlotRangeControls();
}

async function snapshotPreprocess(btn, figures) {
    if (btn.id.endsWith('spectrum')) {
        await snapshotSpectrum(figures);
    } else if (btn.id.endsWith('poloidal')) {
        const quick = btn.id.endsWith('quick_poloidal');
        const playing = window.GTCGlobal.snapshot_playing;
        // quick: do not fft; playing: data scheme is different
        let safety_factor = null;
        if (playing) {
            const fig_1 = document.getElementById('figure-1');
            const fig_2 = document.getElementById('figure-2');
            const [z] = figures.splice(
                0,
                1,
                {
                    data: fig_1.data,
                    layout: fig_1.layout,
                },
                {
                    data: fig_2.data,
                    layout: fig_2.layout,
                }
            );
            figures[0].data[1].z = z;
        } else {
            const res = await requestPlotData('plotType/Equilibrium', {
                optional: true,
            });
            safety_factor = res.ok
                ? (
                      await (
                          await requestPlotData('data/Equilibrium-1D-rg_n-q', {
                              optional: true,
                          })
                      )?.json()
                  )

                      ?.at(0)
                      ?.data?.at(0)
                : null;
        }
        await snapshotPoloidal(
            figures,
            getStatusBar(),
            safety_factor,
            quick,
            playing
        );
    }
    GTCGlobal.current_snapshot_figure = btn;
}

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

async function propagateFetchError(res) {
    if (!res.ok) {
        throw await res.text();
    }
}

function nodeIs(node, predict) {
    if (node) {
        return predict(node) || nodeIs(node.parentElement, predict);
    }
}

function postForm(url, content) {
    const form = document.createElement('form');
    form.method = 'post';
    form.action = url;

    for (const key in content) {
        if (content.hasOwnProperty(key)) {
            const hiddenField = document.createElement('input');
            hiddenField.type = 'hidden';
            hiddenField.name = key;
            hiddenField.value = content[key];

            form.appendChild(hiddenField);
        }
    }

    document.body.appendChild(form);
    form.submit();
}
