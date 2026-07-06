'use strict';

/**
 * Server communication layer for the GTC Visualization plot page.
 *
 * All fetch calls to the Express backend are routed through the functions
 * in this module so that URL construction and error propagation stay in
 * one place.
 *
 * @module api
 */

import { propagateFetchError } from './util.js';

/**
 * Fetch plot data or plot-type metadata from the server.
 *
 * The target simulation directory is read from the `#output-tag` element
 * that is rendered into every plot page by the server.
 *
 * @param {string} name - Route suffix (e.g. "data/History-phi-point").
 * @param {Object} [opts]
 * @param {boolean} [opts.optional=false] - If true, HTTP errors are
 *   silently swallowed and the caller must check `res.ok`.
 * @param {string} [opts.query=''] - Extra query string to append.
 * @returns {Promise<Response>}
 */
export async function requestPlotData(name, opts) {
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

/**
 * POST a download request for GTC output files and return the resulting
 * blob together with the server-suggested filename.
 *
 * @param {string} dir - The simulation output directory.
 * @param {boolean} downloadAll - If true, append `&all` to the query.
 * @param {FormData} fileList - The selected files / form entries.
 * @returns {Promise<{blob: Blob, filename: string|undefined}>}
 */
export async function downloadOutputFiles(dir, downloadAll, fileList) {
    const url = `/plot/data/download?dir=${dir}${downloadAll ? '&all' : ''}`;
    const data = new URLSearchParams();
    for (const [key, val] of fileList.entries()) {
        data.append(key, val);
    }
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: data,
    });
    await propagateFetchError(res);
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition');
    const filename = disposition?.match(/filename="(.*)"/)?.[1];
    return { blob, filename };
}
