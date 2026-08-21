'use strict';

let fftPromise;

/**
 * Load the browser FFTE module on first use.
 *
 * The webpack-ignore directive keeps the handwritten loader and standalone
 * .wasm binary as separately cached browser assets.
 */
export function getFFT() {
    if (!fftPromise) {
        const moduleUrl = new URL('libs/ffte/ffte.js', document.baseURI).href;
        fftPromise = import(/* webpackIgnore: true */ moduleUrl)
            .then(({ createFFT }) =>
                createFFT({ wasmUrl: new URL('ffte.wasm', moduleUrl) })
            );
    }
    return fftPromise;
}
