const SUCCESS = 0;

const REQUIRED_EXPORTS = [
    'memory',
    'malloc',
    'free',
    'ffte_r2c_1d',
    'ffte_r2c_1d_batch',
    'ffte_c2r_1d',
    'ffte_c2c_1d',
    'ffte_c2c_1d_batch',
    'ffte_r2c_2d',
    'ffte_c2r_2d',
    'ffte_c2c_2d',
];

async function instantiate(source, imports) {
    if (source instanceof WebAssembly.Module) {
        return new WebAssembly.Instance(source, imports);
    }
    if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
        const bytes =
            source instanceof ArrayBuffer
                ? source
                : source.buffer.slice(
                      source.byteOffset,
                      source.byteOffset + source.byteLength
                  );
        return (await WebAssembly.instantiate(bytes, imports)).instance;
    }

    const url =
        source instanceof URL ? source : new URL(source, import.meta.url);
    if (url.protocol === 'file:') {
        const { readFile } = await import('node:fs/promises');
        const bytes = await readFile(url);
        return (await WebAssembly.instantiate(bytes, imports)).instance;
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Unable to load FFTE WebAssembly: ${response.status}`);
    }
    if (WebAssembly.instantiateStreaming) {
        try {
            return (
                await WebAssembly.instantiateStreaming(
                    response.clone(),
                    imports
                )
            ).instance;
        } catch {
            // Some servers do not use application/wasm. Array-buffer
            // instantiation remains portable in that case.
        }
    }
    return (
        await WebAssembly.instantiate(await response.arrayBuffer(), imports)
    ).instance;
}

export async function instantiateFFTE(source) {
    const imports = {
        env: {
            // The wrapper does not retain typed-array views, so no refresh is
            // needed when Emscripten grows the exported memory.
            emscripten_notify_memory_growth() {},
        },
    };
    const instance = await instantiate(source, imports);
    for (const name of REQUIRED_EXPORTS) {
        if (!(name in instance.exports)) {
            throw new Error(`FFTE WebAssembly is missing export ${name}`);
        }
    }
    return instance.exports;
}

function requirePositiveInteger(value, name) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError(`${name} must be a positive safe integer`);
    }
}

function checkedProduct(left, right, name) {
    const result = left * right;
    if (!Number.isSafeInteger(result)) {
        throw new RangeError(`${name} is too large`);
    }
    return result;
}

export class FFTE {
    constructor(exports) {
        this.exports = exports;
    }

    _call(input, outputLength, transform) {
        const inputBytes = input.length * Float64Array.BYTES_PER_ELEMENT;
        const outputBytes = outputLength * Float64Array.BYTES_PER_ELEMENT;
        const inputPointer = this.exports.malloc(inputBytes);
        const outputPointer = this.exports.malloc(outputBytes);

        if (inputPointer === 0 || outputPointer === 0) {
            if (inputPointer !== 0) this.exports.free(inputPointer);
            if (outputPointer !== 0) this.exports.free(outputPointer);
            throw new Error('Unable to allocate WebAssembly memory');
        }

        try {
            new Float64Array(this.exports.memory.buffer).set(
                input,
                inputPointer / Float64Array.BYTES_PER_ELEMENT
            );
            const status = transform(inputPointer, outputPointer);
            if (status !== SUCCESS) {
                throw new Error(`FFTE transform failed with status ${status}`);
            }
            const offset = outputPointer / Float64Array.BYTES_PER_ELEMENT;
            return new Float64Array(this.exports.memory.buffer).slice(
                offset,
                offset + outputLength
            );
        } finally {
            this.exports.free(inputPointer);
            this.exports.free(outputPointer);
        }
    }

    r2c1d(values) {
        const input = Float64Array.from(values);
        requirePositiveInteger(input.length, 'input length');
        const complexLength = Math.floor(input.length / 2) + 1;
        return this._call(input, complexLength * 2, (inputPointer, outputPointer) =>
            this.exports.ffte_r2c_1d(inputPointer, input.length, outputPointer)
        );
    }

    r2c1dBatch(values, length) {
        requirePositiveInteger(length, 'length');
        const input =
            values instanceof Float64Array ? values : Float64Array.from(values);
        if (input.length === 0 || input.length % length !== 0) {
            throw new RangeError(
                'input length must be a positive multiple of length'
            );
        }
        const batchCount = input.length / length;
        const outputLength =
            batchCount * 2 * (Math.floor(length / 2) + 1);
        return this._call(input, outputLength, (inputPointer, outputPointer) =>
            this.exports.ffte_r2c_1d_batch(
                inputPointer,
                length,
                batchCount,
                outputPointer
            )
        );
    }

    c2r1d(spectrum, length) {
        requirePositiveInteger(length, 'length');
        const input = Float64Array.from(spectrum);
        const expectedLength = 2 * (Math.floor(length / 2) + 1);
        if (input.length !== expectedLength) {
            throw new RangeError(
                `spectrum must contain ${expectedLength} doubles`
            );
        }
        return this._call(input, length, (inputPointer, outputPointer) =>
            this.exports.ffte_c2r_1d(inputPointer, length, outputPointer)
        );
    }

    c2c1d(values, inverse = false) {
        const input = Float64Array.from(values);
        if (input.length === 0 || input.length % 2 !== 0) {
            throw new RangeError(
                'values must contain interleaved complex pairs'
            );
        }
        const length = input.length / 2;
        return this._call(input, input.length, (inputPointer, outputPointer) =>
            this.exports.ffte_c2c_1d(
                inputPointer,
                length,
                inverse ? 1 : -1,
                outputPointer
            )
        );
    }

    c2c1dBatch(values, length, inverse = false) {
        requirePositiveInteger(length, 'length');
        const input =
            values instanceof Float64Array ? values : Float64Array.from(values);
        const transformWidth = length * 2;
        if (input.length === 0 || input.length % transformWidth !== 0) {
            throw new RangeError(
                'input length must be a positive multiple of 2 * length'
            );
        }
        const batchCount = input.length / transformWidth;
        return this._call(input, input.length, (inputPointer, outputPointer) =>
            this.exports.ffte_c2c_1d_batch(
                inputPointer,
                length,
                batchCount,
                inverse ? 1 : -1,
                outputPointer
            )
        );
    }

    r2c2d(values, rows, columns) {
        requirePositiveInteger(rows, 'rows');
        requirePositiveInteger(columns, 'columns');
        const input = Float64Array.from(values);
        const expectedLength = checkedProduct(rows, columns, 'input shape');
        if (input.length !== expectedLength) {
            throw new RangeError(`input must contain ${expectedLength} doubles`);
        }
        const outputLength = checkedProduct(
            rows,
            2 * (Math.floor(columns / 2) + 1),
            'output shape'
        );
        return this._call(input, outputLength, (inputPointer, outputPointer) =>
            this.exports.ffte_r2c_2d(inputPointer, rows, columns, outputPointer)
        );
    }

    c2r2d(spectrum, rows, columns) {
        requirePositiveInteger(rows, 'rows');
        requirePositiveInteger(columns, 'columns');
        const input = Float64Array.from(spectrum);
        const expectedLength = checkedProduct(
            rows,
            2 * (Math.floor(columns / 2) + 1),
            'spectrum shape'
        );
        if (input.length !== expectedLength) {
            throw new RangeError(`spectrum must contain ${expectedLength} doubles`);
        }
        const outputLength = checkedProduct(rows, columns, 'output shape');
        return this._call(input, outputLength, (inputPointer, outputPointer) =>
            this.exports.ffte_c2r_2d(
                inputPointer,
                rows,
                columns,
                outputPointer
            )
        );
    }

    c2c2d(values, rows, columns, inverse = false) {
        requirePositiveInteger(rows, 'rows');
        requirePositiveInteger(columns, 'columns');
        const input = Float64Array.from(values);
        const expectedLength = 2 * checkedProduct(rows, columns, 'input shape');
        if (input.length !== expectedLength) {
            throw new RangeError(
                `input must contain ${expectedLength} doubles`
            );
        }
        return this._call(input, input.length, (inputPointer, outputPointer) =>
            this.exports.ffte_c2c_2d(
                inputPointer,
                rows,
                columns,
                inverse ? 1 : -1,
                outputPointer
            )
        );
    }
}

export async function createFFT(options = {}) {
    const source =
        options.wasm ??
        options.wasmUrl ??
        new URL('../dist/ffte.wasm', import.meta.url);
    return new FFTE(await instantiateFFTE(source));
}
