'use strict';

/**
 * GTC output file download form for the plot page.
 *
 * Wires the expand/collapse file-list button and the "Download all" /
 * "Download selected" submit buttons.  The actual POST request is
 * delegated to {@link module:api.downloadOutputFiles}.
 *
 * @module download
 */

import { wrap } from './status-bar.js';
import { downloadOutputFiles } from '../shared/api.js';

/**
 * Attach event listeners to the download form (`#download-output`).
 * Must be called once after the DOM is ready.
 */
export function setupDownloadForm() {
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

                const { blob, filename } = await downloadOutputFiles(
                    document.querySelector('#output-tag').innerText,
                    e.target.id.endsWith('all'),
                    new FormData(downloadForm)
                );

                // create link for downloading file
                const a = document.body.appendChild(
                    document.createElement('a')
                );
                a.href = window.URL.createObjectURL(blob);
                if (filename) {
                    a.download = filename;
                }
                a.click();
                a.remove();
                loading.style.visibility = 'hidden';
            })
        )
    );
}
