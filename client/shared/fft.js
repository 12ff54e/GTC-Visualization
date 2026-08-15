'use strict';

let fftPromise;

class FFTEClient {
    constructor(module) {
        this.module = module;
    }

    _transform(input, outputLength, transform) {
        const inputPointer = this.module._malloc(input.byteLength);
        const outputPointer = this.module._malloc(outputLength * 8);

        if (inputPointer === 0 || outputPointer === 0) {
            if (inputPointer !== 0) this.module._free(inputPointer);
            if (outputPointer !== 0) this.module._free(outputPointer);
            throw new Error('Unable to allocate FFTE WebAssembly memory');
        }

        try {
            this.module.HEAPF64.set(input, inputPointer / 8);
            const status = transform(inputPointer, outputPointer);
            if (status !== 0) {
                throw new Error(`FFTE transform failed with status ${status}`);
            }
            return this.module.HEAPF64.slice(
                outputPointer / 8,
                outputPointer / 8 + outputLength
            );
        } finally {
            this.module._free(inputPointer);
            this.module._free(outputPointer);
        }
    }

    r2c1d(values) {
        const input = Float64Array.from(values);
        if (input.length === 0) {
            throw new RangeError('FFT input cannot be empty');
        }

        const outputLength = 2 * (Math.floor(input.length / 2) + 1);
        return this._transform(input, outputLength, (inputPointer, outputPointer) =>
            this.module._ffte_r2c_1d(
                inputPointer,
                input.length,
                outputPointer
            )
        );
    }

    c2c1d(values, inverse = false) {
        const input = Float64Array.from(values);
        if (input.length === 0 || input.length % 2 !== 0) {
            throw new RangeError('FFT input must contain complex pairs');
        }

        return this._transform(input, input.length, (inputPointer, outputPointer) =>
            this.module._ffte_c2c_1d(
                inputPointer,
                input.length / 2,
                inverse ? 1 : -1,
                outputPointer
            )
        );
    }
}

/**
 * Load the browser FFTE module on first use.
 *
 * The webpack-ignore directive keeps the generated Emscripten module as a
 * separately cached browser asset alongside its .wasm file.
 */
export function getFFT() {
    if (!fftPromise) {
        const moduleUrl = new URL('libs/ffte/ffte.js', document.baseURI).href;
        fftPromise = import(/* webpackIgnore: true */ moduleUrl)
            .then(({ default: createFFTE }) =>
                createFFTE({
                    locateFile: file => new URL(file, moduleUrl).href,
                })
            )
            .then(module => new FFTEClient(module));
    }
    return fftPromise;
}
