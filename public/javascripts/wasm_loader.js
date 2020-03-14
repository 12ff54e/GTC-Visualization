import { instantiate } from './assemblyscript_loader.js'

/**
 * wasm loader exposed specified functions, designed for 'load once, use everywhere'.
 *  It wraps over '@assemblyscript_loader'
 */
export default class {
    constructor(bin) {
        this.bin = bin;
    }

    /**
     * 
     * @param {string | WebAssembly.Module | BufferSource | Response | PromiseLike<WebAssembly.Module | BufferSource | Response>} src 
     */
    static async instantiate(src) {
        const wasm = typeof src === 'string' ?
            await fetch(src) :
            src;
        const bin = await instantiate(wasm);
        return new this(bin);
    }

    /**
     * @param {Float64Array} real
     * @param {Float64Array} imag
     * 
     * @returns {Float64Array} fft
     */
    spectrum(real, imag = undefined) {
        const {
            __retain, __release, __allocArray, __getFloat64Array,
            realSpectrum, complexSpectrum, F64ARR_ID
        } = this.bin;

        let output;
        const ptr1 = __retain(__allocArray(F64ARR_ID, real));
        if (imag) {
            const ptr2 = __retain(__allocArray(F64ARR_ID, imag));
            output = __getFloat64Array(complexSpectrum(ptr1, ptr2));
            __release(ptr2);
        } else {
            output = __getFloat64Array(realSpectrum(ptr1));
        }
        __release(ptr1);

        return output;
    }
}
