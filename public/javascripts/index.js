'use strict';
import {
    historyMode,
    trackingPlot,
    addSimulationRegion,
} from './plot-data-process.js';
import { generateSummary } from './summary-generate.js';
import './state.js';
import { callEventTarget } from './util.js';
import { requestPlotData } from './api.js';
import {
    getBasicParameters,
    refreshTimeUnitFactor,
    applyTimeUnitToFigures,
    TIME_UNIT_LABEL,
} from './units.js';
import {
    ensurePlotRangeControls,
    renderPlotRangeControls,
    refreshPlotRangeControls,
} from './figure-range-controls.js';
import {
    StatusBar,
    getStatusBar,
    wrap,
    addLoadingIndicator,
} from './status-bar.js';
import { setupBreadcrumbs } from './navigation.js';
import { setupDownloadForm } from './download.js';
import { addHistoryRecal } from './history-recal.js';
import {
    snapshotPreprocess,
    addSnapshotPlayer,
    snapshotPoloidalPreview,
} from './snapshot.js';

// StatusBar, getStatusBar, wrap, and addLoadingIndicator are now
// imported from status-bar.js

// Global application state is now managed by state.js (imported above).
// It is still accessible as `window.GTCGlobal` for backward compatibility
// with modules that have not yet been migrated to direct ES imports.

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
            window.GTCGlobal.units.time = e.target.value;
            await refreshTimeUnitFactor();

            if (window.GTCGlobal.current_plot_btn) {
                await addLoadingIndicator(
                    getDataThenPlot.bind(window.GTCGlobal.current_plot_btn)
                )();
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

    setupDownloadForm();

    setupBreadcrumbs();
});

window.addEventListener('error', () => {
    getStatusBar().err = StatusBar.DEFAULT_ERROR;
});

function registerButtons(buttons, cb = getDataThenPlot) {
    buttons.forEach(btn => {
        btn.addEventListener(
            'click',
            wrap(addLoadingIndicator(callEventTarget(cb)))
        );
    });
}

// Figure range controls (ensurePlotRangeControls, renderPlotRangeControls,
// refreshPlotRangeControls) are now imported from figure-range-controls.js

async function openPanel(clean_beforehand = true) {
    if (this.id == 'Summary') {
        await buildSummaryPage();
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

async function buildSummaryPage() {
    await getBasicParameters();
    const summary_data = await (await requestPlotData('Summary')).json();
    const summaryContainer = await generateSummary(summary_data);

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
