/**
 * Multi Dimension slice of array, similar to that in Mathematica.
 *  Recursive implementation.
 *
 * @param {Array} arr the array to be sliced
 * @param {Array} ijk Specifies part of each dimension to be extracted,
 *  could be integers, tuple of Integers or 'All', with negative number
 *  indicating counting from the end. When a tuple of integers are specified,
 *  it acts like Array.prototype.slice() at that level of depth.
 */
function part(arr, ijk) {
    let index = ijk.shift();
    if (index === undefined) {
        // recursion terminated
        return arr;
    } else if (typeof index === 'number') {
        // index
        return part(arr[index >= 0 ? index : arr.length + index], ijk.slice());
    } else if (Array.isArray(index)) {
        // range
        index = index.map(i => (i >= 0 ? i : i + arr.length));
        if (index.length !== 2 || index[0] >= index[1]) {
            throw new Error('Invalid range');
        }
        return arr.slice(...index).map(sub => part(sub, ijk.slice()));
    } else if (index === 'All') {
        // keep all entries
        return arr.map(e => part(e, ijk.slice()));
    }
}

/**
 * Home-made flat method
 *
 * @returns {Array} the flattened array
 */
function flat(array) {
    return array.reduce((acc, curr) => {
        if (Array.isArray(curr)) {
            return [...acc, ...flat(curr)];
        } else {
            return [...acc, curr];
        }
    }, []);
}

/**
 * This function return an integer sequence
 *  range(n) => [0 .. n-1], or
 *  range(m, n) => [m .. n-1]
 *
 * @param {Number} initOrLen when this function is given one parameter,
 *  this parameter will be array length
 * @param {Number} end
 */
function range(initOrLen, end) {
    if (end === undefined) {
        return [...Array(initOrLen).keys()];
    } else {
        return [...Array(end - initOrLen).keys()].map(i => i + initOrLen);
    }
}

async function parseWebStreamByLine(stream, parser) {
    const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
    let { value, done } = await reader.read();
    let lineNum = 0;
    let prevStr = '';
    while (!done) {
        // process current chunk
        let lineBegin = 0;
        let lineEnd;
        while ((lineEnd = value.indexOf('\n', lineBegin)) != -1) {
            parser.next(
                (lineBegin == 0 ? '' : prevStr) +
                    value.slice(lineBegin, lineEnd)
            );
            lineNum++;
            lineBegin = lineEnd + 1;
        }
        prevStr = value.slice(lineBegin);

        ({ value, done } = await reader.read());
    }
    return lineNum;
}

async function parseStreamByLine(stream, parser) {
    const rl = require('readline').createInterface({
        input: stream,
        ctrlDelay: Infinity,
    });
    let lineNum = 0;
    rl.on('line', line => {
        parser.next(line);
        lineNum++;
    });

    await require('events').once(rl, 'close');

    return lineNum;
}

module.exports = {
    part,
    flat,
    range,
    parseWebStreamByLine,
    parseStreamByLine,
};
