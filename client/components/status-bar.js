'use strict';

/**
 * Application shell for the GTC Visualization plot page.
 *
 * Provides the status bar, an async error-handling wrapper, and a loading-
 * indicator wrapper.  These are used by virtually every other module and
 * depend on nothing except well-known DOM elements that are guaranteed to
 * be present on the plot page.
 *
 * @module status-bar
 */

// ------------------------------------------------------------------
//  StatusBar
// ------------------------------------------------------------------

export class StatusBar {
    constructor(root) {
        this.parent = root;
        root.status = this;
    }
    toString() {
        return (
            (this.information
                ? `<font color="green">${this.information}</font><br>`
                : '') +
            (this.warning
                ? `<font color="darkYellow">${this.warning}</font><br>`
                : '') +
            (this.error ? `<font color="red">${this.error}</font><br>` : '')
        );
    }
    show() {
        this.parent.innerHTML = this;
    }
    /**
     * @param {string} i
     */
    set info(i) {
        this.information = i;
        this.show();
    }
    /**
     * @param {string} w
     */
    set warn(w) {
        this.warning = w;
        this.show();
    }
    /**
     * @param {string} e
     */
    set err(e) {
        this.error = e;
        this.show();
    }
}

Object.defineProperty(StatusBar, 'DEFAULT_ERROR', {
    value:
        'Oops, something wrong happened. Please check javascript console for more info.',
    writable: false,
    enumerable: true,
    configurable: false,
});

/**
 * Return the StatusBar instance currently mounted in the DOM.
 * @returns {StatusBar}
 */
export function getStatusBar() {
    return document.querySelector('#status').status;
}

// ------------------------------------------------------------------
//  Async wrappers
// ------------------------------------------------------------------

/**
 * Wrap an async function so that any rejection is caught, logged, and
 * displayed in the status bar instead of producing an unhandled rejection.
 *
 * @param {Function} func - An async function whose errors should be caught.
 * @returns {Function} A wrapped version of `func`.
 */
export function wrap(func) {
    return (...args) =>
        func(...args).catch(err => {
            console.log(err);
            getStatusBar().err = StatusBar.DEFAULT_ERROR;
        });
}

/**
 * Wrap an async function so that the loading spinner (`#loading`) is
 * shown while the function executes and hidden when it completes (or
 * fails).
 *
 * @param {Function} func - An async function.
 * @returns {Function} A wrapped version of `func`.
 */
export function addLoadingIndicator(func) {
    return async (...args) => {
        const loading = document.querySelector('#loading');
        loading.style.visibility = 'visible';

        await func(...args);

        loading.style.visibility = 'hidden';
    };
}
