/**
 * Tests for per-figure Plotly data downloads.
 *
 * Run with:
 *   node --test test/figure-data-download.test.js
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('figure data download', () => {
    let figureDataToCsv;
    let figureDataToJson;
    let createPlotConfig;
    let downloadFigureData;
    let downloadFigureDataJson;
    let originalPlotly;

    beforeEach(async () => {
        originalPlotly = global.Plotly;
        global.Plotly = {
            Icons: {
                disk: { path: 'disk-icon' },
            },
        };

        ({
            figureDataToCsv,
            figureDataToJson,
            createPlotConfig,
            downloadFigureData,
            downloadFigureDataJson,
        } = await import('../client/components/figure-data-download.js'));
    });

    afterEach(() => {
        if (originalPlotly === undefined) {
            delete global.Plotly;
        } else {
            global.Plotly = originalPlotly;
        }
    });

    it('exports one-dimensional traces as long-form CSV rows', () => {
        const csv = figureDataToCsv([
            {
                name: 'wave, "A"',
                type: 'scatter',
                x: [0, 1],
                y: [2, 3],
                text: ['plain', '=SUM(A1:A2)'],
            },
        ]);

        assert.equal(
            csv,
            [
                'trace_index,trace_name,trace_type,point_index,row,column,x,y,text',
                '0,"wave, ""A""",scatter,0,,,0,2,plain',
                "0,\"wave, \"\"A\"\"\",scatter,1,,,1,3,'=SUM(A1:A2)",
            ].join('\r\n')
        );
    });

    it('expands heatmap axes into one row per matrix cell', () => {
        const csv = figureDataToCsv([
            {
                name: 'temperature',
                type: 'heatmap',
                x: [10, 20],
                y: [1, 2],
                z: [
                    [3, 4],
                    [5, 6],
                ],
            },
        ]);
        const rows = csv.split('\r\n');

        assert.equal(
            rows[0],
            'trace_index,trace_name,trace_type,point_index,row,column,x,y,z'
        );
        assert.deepEqual(rows.slice(1), [
            '0,temperature,heatmap,0,0,0,10,1,3',
            '0,temperature,heatmap,1,0,1,20,1,4',
            '0,temperature,heatmap,2,1,0,10,2,5',
            '0,temperature,heatmap,3,1,1,20,2,6',
        ]);
    });

    it('preserves complete nested trace data in JSON', () => {
        const traces = [
            {
                name: 'temperature',
                type: 'heatmap',
                z: [
                    [1, 2],
                    [3, 4],
                ],
                colorbar: { title: { text: 'T' } },
            },
        ];

        assert.deepEqual(JSON.parse(figureDataToJson(traces)), traces);
        assert.match(figureDataToJson(traces), /\n  \{/);
    });

    it('preserves existing modebar buttons and appends both data buttons', () => {
        const existing = { name: 'Existing button' };
        const config = createPlotConfig({
            editable: true,
            modeBarButtonsToAdd: [existing],
        });

        assert.equal(config.editable, true);
        assert.equal(config.modeBarButtonsToAdd[0], existing);
        assert.equal(config.modeBarButtonsToAdd[1].icon.path, 'disk-icon');
        assert.equal(
            config.modeBarButtonsToAdd[1].name,
            'Download plotted data as CSV'
        );
        assert.equal(config.modeBarButtonsToAdd[1].click, downloadFigureData);
        assert.equal(typeof config.modeBarButtonsToAdd[2].icon, 'function');
        assert.equal(
            config.modeBarButtonsToAdd[2].name,
            'Download plotted data as JSON'
        );
        assert.equal(
            config.modeBarButtonsToAdd[2].click,
            downloadFigureDataJson
        );

        const originalDocument = global.document;
        global.document = {
            createElement(tag) {
                assert.equal(tag, 'span');
                return {
                    setAttribute(name, value) {
                        this[name] = value;
                    },
                };
            },
        };
        try {
            const icon = config.modeBarButtonsToAdd[2].icon();
            assert.equal(
                icon.className,
                'material-symbols-outlined modebar-material-symbol'
            );
            assert.equal(icon.textContent, 'file_json');
            assert.equal(icon['aria-hidden'], 'true');
        } finally {
            global.document = originalDocument;
        }
    });

    it('downloads current graph data with a title-derived filename', async () => {
        const originalDocument = global.document;
        const originalUrl = global.URL;
        const originalSetTimeout = global.setTimeout;
        let appendedLink;
        let clicked = false;
        let removed = false;
        let downloadedBlob;
        let revokedUrl;

        global.document = {
            createElement(tag) {
                assert.equal(tag, 'a');
                return {
                    click() {
                        clicked = true;
                    },
                    remove() {
                        removed = true;
                    },
                };
            },
            body: {
                appendChild(link) {
                    appendedLink = link;
                },
            },
        };
        global.URL = {
            createObjectURL(blob) {
                downloadedBlob = blob;
                return 'blob:test';
            },
            revokeObjectURL(url) {
                revokedUrl = url;
            },
        };
        global.setTimeout = callback => callback();

        try {
            downloadFigureData({
                id: 'figure-1',
                data: [{ x: [1], y: [2] }],
                layout: { title: { text: 'Growth / rate' } },
            });

            assert.equal(appendedLink.href, 'blob:test');
            assert.equal(appendedLink.download, 'Growth - rate.csv');
            assert.equal(appendedLink.hidden, true);
            assert.equal(clicked, true);
            assert.equal(removed, true);
            assert.equal(revokedUrl, 'blob:test');
            const bytes = new Uint8Array(await downloadedBlob.arrayBuffer());
            assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
            assert.match(await downloadedBlob.text(), /^trace_index,/);
        } finally {
            global.document = originalDocument;
            global.URL = originalUrl;
            global.setTimeout = originalSetTimeout;
        }
    });

    it('downloads current graph data as JSON', async () => {
        const originalDocument = global.document;
        const originalUrl = global.URL;
        const originalSetTimeout = global.setTimeout;
        let link;
        let downloadedBlob;

        global.document = {
            createElement() {
                return {
                    click() {},
                    remove() {},
                };
            },
            body: {
                appendChild(element) {
                    link = element;
                },
            },
        };
        global.URL = {
            createObjectURL(blob) {
                downloadedBlob = blob;
                return 'blob:json-test';
            },
            revokeObjectURL() {},
        };
        global.setTimeout = callback => callback();

        const traces = [{ type: 'scatter3d', x: [1], y: [2], z: [3] }];
        try {
            downloadFigureDataJson({
                id: 'figure-2',
                data: traces,
                layout: {},
            });

            assert.equal(link.href, 'blob:json-test');
            assert.equal(link.download, 'figure-2.json');
            assert.equal(
                downloadedBlob.type,
                'application/json;charset=utf-8'
            );
            assert.deepEqual(JSON.parse(await downloadedBlob.text()), traces);
        } finally {
            global.document = originalDocument;
            global.URL = originalUrl;
            global.setTimeout = originalSetTimeout;
        }
    });
});
