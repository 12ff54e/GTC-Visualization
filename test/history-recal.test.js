/** Tests for History recalculation control positioning. */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('History recalculation control positioning', () => {
    it('pins when the control anchor reaches its top offset', async () => {
        const originalWindow = global.window;
        global.window = {};
        let updateHistoryRecalPosition;
        try {
            ({ updateHistoryRecalPosition } = await import(
                '../client/plotting/history-recal.js'
            ));
        } finally {
            global.window = originalWindow;
        }
        const classes = new Set();
        const control = {
            classList: {
                toggle(name, enabled) {
                    if (enabled) {
                        classes.add(name);
                    } else {
                        classes.delete(name);
                    }
                },
            },
        };
        let anchorTop = 21;
        const anchor = {
            getBoundingClientRect() {
                return { top: anchorTop };
            },
        };

        updateHistoryRecalPosition(anchor, control);
        assert.equal(classes.has('history-recalculate-pinned'), false);

        anchorTop = 20;
        updateHistoryRecalPosition(anchor, control);
        assert.equal(classes.has('history-recalculate-pinned'), true);

        anchorTop = 50;
        updateHistoryRecalPosition(anchor, control);
        assert.equal(classes.has('history-recalculate-pinned'), false);
    });
});
