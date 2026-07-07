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

import './state.js';
import { callEventTarget } from './util.js';
import { refreshTimeUnitFactor, TIME_UNIT_LABEL } from './units.js';
import {
    openPanel,
    getDataThenPlot,
    cleanPlot,
    cleanPanel,
} from './figure-manager.js';
import {
    StatusBar,
    getStatusBar,
    wrap,
    addLoadingIndicator,
} from './status-bar.js';
import { setupBreadcrumbs } from './navigation.js';
import { setupDownloadForm } from './download.js';

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
            window.GTCGlobal.units.time = e.target.value;
            await refreshTimeUnitFactor();

            if (window.GTCGlobal.current_plot_btn) {
                await addLoadingIndicator(
                    getDataThenPlot.bind(window.GTCGlobal.current_plot_btn)
                )();
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
                window.GTCGlobal.current_snapshot = e.target;
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
