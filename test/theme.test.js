const { test } = require('node:test');
const assert = require('node:assert/strict');

function temporaryGlobals(t, values) {
    const previous = Object.fromEntries(
        Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
    );
    for (const [key, value] of Object.entries(values)) {
        Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    t.after(() => {
        for (const [key, descriptor] of Object.entries(previous)) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    });
}

function browser(t, stored, blocked = false) {
    const media = new EventTarget();
    media.matches = false;
    const window = new EventTarget();
    window.matchMedia = () => media;
    const host = { children: [], append(...children) { this.children.push(...children); } };
    const document = new EventTarget();
    document.documentElement = { dataset: {} };
    document.querySelectorAll = selector => selector === '[data-theme-control]'
        ? [host]
        : host.children.filter(child => child.dataset.themeSelect !== undefined);
    document.createElement = () => Object.assign(new EventTarget(), {
        dataset: {}, options: [], add(option) { this.options.push(option); },
    });
    const storage = new Map([['gtc-visualization-theme', stored]]);
    temporaryGlobals(t, {
        window, document,
        Option: class { constructor(text, value) { Object.assign(this, { text, value }); } },
        localStorage: {
            getItem(key) { if (blocked) throw new Error('Storage blocked'); return storage.get(key); },
            setItem(key, value) { if (blocked) throw new Error('Storage blocked'); storage.set(key, value); },
        },
    });
    return { window, document, media, storage, host };
}

test('theme preference resolves invalid and system choices safely', async () => {
    const { normalizeTheme, resolveTheme } = await import('../client/shared/theme-preference.js');
    assert.equal(normalizeTheme('unknown'), 'system');
    assert.equal(resolveTheme(null, true), 'dark');
    assert.equal(resolveTheme('system', false), 'light');
    assert.equal(resolveTheme('light', true), 'light');
    assert.equal(resolveTheme('dark', false), 'dark');
});

test('saved theme applies before DOM ready; user and cross-tab choices stay in sync', async t => {
    const { window, document, media, storage, host } = browser(t, 'dark');
    await import('../client/theme.js?saved');
    assert.equal(document.documentElement.dataset.theme, 'dark');
    assert.equal(host.children.length, 0);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    const select = host.children[1];
    assert.equal(select.value, 'dark');
    assert.equal(host.children[0].htmlFor, select.id);
    select.value = 'light';
    select.dispatchEvent(new Event('change'));
    assert.equal(document.documentElement.dataset.theme, 'light');
    assert.equal(storage.get('gtc-visualization-theme'), 'light');
    media.matches = true;
    media.dispatchEvent(new Event('change'));
    assert.equal(document.documentElement.dataset.theme, 'light');
    window.dispatchEvent(Object.assign(new Event('storage'), {
        key: 'gtc-visualization-theme', newValue: 'system',
    }));
    assert.equal(select.value, 'system');
    assert.equal(document.documentElement.dataset.theme, 'dark');
    media.matches = false;
    media.dispatchEvent(new Event('change'));
    assert.equal(document.documentElement.dataset.theme, 'light');
});

test('blocked local storage still permits theme changes', async t => {
    const { document, host } = browser(t, null, true);
    await import('../client/theme.js?blocked');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    const select = host.children[1];
    select.value = 'dark';
    select.dispatchEvent(new Event('change'));
    assert.equal(document.documentElement.dataset.theme, 'dark');
});

test('plot colors change without mutating axis ranges, scene camera or color scales', async () => {
    const { themedLayout, plotThemeUpdates } = await import('../client/shared/plot-theme.js');
    const layout = {
        title: 'A figure',
        font: { size: 16, family: 'Arial' },
        xaxis: { type: 'log', range: [1, 2], autorange: false, title: 'Time' },
        yaxis2: { range: [3, 4], overlaying: 'y', rangeslider: { visible: true } },
        scene: { camera: { eye: { x: 1, y: 2, z: 3 } }, zaxis: { range: [-1, 1] } },
        coloraxis: { colorscale: 'RdBu', cmin: -2, cmax: 2 },
    };
    const before = structuredClone(layout);
    const colors = { paper: '#18242f', plot: '#18242f', text: '#e0eaf2', grid: '#354a5a' };
    const result = themedLayout(layout, colors);
    assert.deepEqual(layout, before);
    assert.equal(result.title.text, 'A figure');
    assert.equal(result.xaxis.title.text, 'Time');
    assert.equal(result.font.size, 16);
    assert.equal(result.font.color, colors.text);
    assert.deepEqual(result.xaxis.range, [1, 2]);
    assert.equal(result.xaxis.autorange, false);
    assert.deepEqual(result.scene.camera, before.scene.camera);
    assert.equal(result.scene.zaxis.gridcolor, colors.grid);
    assert.equal(result.coloraxis.colorscale, 'RdBu');
    assert.equal(result.coloraxis.cmin, -2);
    const updates = plotThemeUpdates(layout, colors);
    assert.ok(Object.keys(updates).every(key => !/range$|autorange|camera|colorscale|cmin|cmax/.test(key)));
});

test('new and existing figures use the selected palette without replacing their data', async t => {
    const graph = { layout: { xaxis: { range: [2, 5] } }, data: [{ x: [2, 5], y: [3, 6] }] };
    const calls = [];
    const window = new EventTarget();
    temporaryGlobals(t, {
        window,
        document: { documentElement: {}, querySelectorAll: () => [graph] },
        getComputedStyle: () => ({ getPropertyValue: key => ({
            '--plot-paper': '#18242f', '--plot-bg': '#18242f',
            '--text-color': '#e0eaf2', '--plot-grid': '#354a5a',
        })[key] }),
        Plotly: {
            newPlot(...args) { calls.push(args); return Promise.resolve(graph); },
            react(...args) { calls.push(args); return Promise.resolve(graph); },
            relayout(...args) { calls.push(args); return Promise.resolve(graph); },
        },
    });
    const { newThemedPlot, reactThemedPlot, setupPlotTheme } = await import('../client/shared/plot-theme.js');
    const config = { editable: true };
    await newThemedPlot(graph, graph.data, graph.layout, config);
    await reactThemedPlot(graph, graph.data, graph.layout, config);
    for (const call of calls) {
        assert.equal(call[1], graph.data);
        assert.equal(call[2].paper_bgcolor, '#18242f');
        assert.equal(call[3], config);
    }
    calls.length = 0;
    setupPlotTheme();
    window.dispatchEvent(new Event('gtc-theme-change'));
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], graph);
    assert.equal(calls[0][1].paper_bgcolor, '#18242f');
    assert.equal(calls[0][1]['xaxis.range'], undefined);
    assert.deepEqual(graph.layout.xaxis.range, [2, 5]);
});
