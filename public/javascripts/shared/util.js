'use strict';

/**
 * Shared pure-utility functions for the GTC Visualization plot page.
 *
 * These functions have **no dependency on application state** (GTCGlobal)
 * and **no hard-coded DOM queries**.  They are generic helpers that could
 * be useful in any web application.
 *
 * @module util
 */

// ------------------------------------------------------------------
//  DOM helpers
// ------------------------------------------------------------------

/**
 * Create an event handler that calls `func` with `this` bound to
 * `transform(event.target)`.  Useful when an event handler needs to be
 * called with the semantic target rather than the raw event.
 *
 * @param {Function} func - The function to call.
 * @param {Function} [transform] - Transforms the event target.
 *   Default: `e => e.target`.
 * @returns {Function} An event handler function.
 */
export function callEventTarget(func, transform = e => e.target) {
    return e => func.call(transform(e));
}

/**
 * Throw a fetch Response's text body if the response status is not OK.
 *
 * @param {Response} res - A Fetch API Response object.
 * @returns {Promise<void>} Resolves when `res.ok`; rejects with the
 *   response text otherwise.
 */
export async function propagateFetchError(res) {
    if (!res.ok) {
        throw await res.text();
    }
}

/**
 * Walk up the DOM tree from `node`, testing each ancestor (including
 * `node` itself) against `predict`.
 *
 * @param {Node|null} node - The starting node.
 * @param {Function} predict - Predicate receiving each ancestor.
 * @returns {boolean} True if any ancestor matches `predict`.
 */
export function nodeIs(node, predict) {
    if (node) {
        return predict(node) || nodeIs(node.parentElement, predict);
    }
    return false;
}

/**
 * Programmatically submit a POST form with the given key-value pairs.
 *
 * @param {string} url - The form action URL.
 * @param {Object} content - Key-value pairs included as hidden inputs.
 */
export function postForm(url, content) {
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

// ------------------------------------------------------------------
//  Array / math helpers
// ------------------------------------------------------------------

/**
 * Return the [min, max] of a numeric array in a single pass.
 *
 * @param {number[]} arr
 * @returns {[number, number]}
 */
export function min_max(arr) {
    return arr.reduce(
        ([min, max], curr) => [Math.min(min, curr), Math.max(max, curr)],
        [Infinity, -Infinity]
    );
}

/**
 * Interleave two equal-length arrays: [a₀, b₀, a₁, b₁, …].
 *
 * @param {Array} as
 * @param {Array} bs
 * @returns {Array}
 */
export function interleave(as, bs) {
    return as.flatMap((val, idx) => [val, bs[idx]]);
}

/**
 * De-interleave a flat array of alternating [a, b] pairs into an array
 * of `[a, b]` tuples.
 *
 * @param {Array} cs - Flat array [a₀, b₀, a₁, b₁, …].
 * @returns {Array<[any, any]>}
 */
export function unInterleave(cs) {
    return cs.reduce((arr, val, idx) => {
        if (idx % 2 == 0) {
            arr.push([val]);
        } else {
            arr.at(-1).push(val);
        }
        return arr;
    }, []);
}
