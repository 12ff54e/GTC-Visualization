'use strict';

/**
 * Per-figure data export for Plotly figures.
 *
 * Plotly passes the graph div to custom modebar button callbacks.  The graph
 * div's public `data` property contains the traces as they are currently
 * plotted, including client-side unit conversions and recalculations.
 *
 * @module figure-data-download
 */

const POINT_FIELDS = [
    'x',
    'y',
    'z',
    'a',
    'b',
    'r',
    'theta',
    'lat',
    'lon',
    'values',
    'labels',
    'text',
    'hovertext',
    'ids',
    'locations',
    'customdata',
];

const COLUMN_AXIS_FIELDS = new Set(['x', 'a', 'lon']);
const ROW_AXIS_FIELDS = new Set(['y', 'b', 'lat']);

function createJsonIcon() {
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined modebar-material-symbol';
    icon.textContent = 'file_json';
    icon.setAttribute('aria-hidden', 'true');
    return icon;
}

function csvValue(value) {
    if (value === undefined || value === null) {
        return '';
    }

    let text;
    if (typeof value === 'object') {
        text = JSON.stringify(value);
    } else {
        text = String(value);
    }

    // Prevent spreadsheet applications from interpreting trace labels or
    // text as formulas. Numeric values are not changed.
    if (typeof value === 'string' && /^[=+\-@]/.test(text)) {
        text = `'${text}`;
    }

    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function traceFields(trace) {
    return POINT_FIELDS.filter(field => Array.isArray(trace?.[field]));
}

function matrixShape(trace, fields) {
    let rows = 0;
    let columns = 0;

    for (const field of fields) {
        const values = trace[field];
        if (!values.some(Array.isArray)) {
            continue;
        }
        rows = Math.max(rows, values.length);
        for (const row of values) {
            if (Array.isArray(row)) {
                columns = Math.max(columns, row.length);
            }
        }
    }

    return { rows, columns };
}

function gridValue(values, field, row, column, rows, columns) {
    if (values.some(Array.isArray)) {
        return values[row]?.[column];
    }
    if (COLUMN_AXIS_FIELDS.has(field)) {
        return values[column];
    }
    if (ROW_AXIS_FIELDS.has(field)) {
        return values[row];
    }
    if (values.length === rows * columns) {
        return values[row * columns + column];
    }
    if (values.length === columns) {
        return values[column];
    }
    if (values.length === rows) {
        return values[row];
    }
    return undefined;
}

/**
 * Serialize Plotly trace data to a rectangular, long-form CSV document.
 *
 * One-dimensional traces produce one row per point. Matrix traces such as
 * heatmaps and contours produce one row per cell, with their one-dimensional
 * x/y (or a/b) axes expanded to the matching column/row coordinate.
 *
 * @param {Array<Object>} traces Plotly trace objects.
 * @returns {string} CSV text without a byte-order mark.
 */
export function figureDataToCsv(traces = []) {
    const fields = [
        ...new Set(traces.flatMap(trace => traceFields(trace))),
    ];
    const header = [
        'trace_index',
        'trace_name',
        'trace_type',
        'point_index',
        'row',
        'column',
        ...fields,
    ];
    const rows = [header.map(csvValue).join(',')];

    traces.forEach((trace, traceIndex) => {
        const availableFields = traceFields(trace);
        const { rows: gridRows, columns: gridColumns } = matrixShape(
            trace,
            availableFields
        );
        const prefix = [
            traceIndex,
            trace.name ?? `trace ${traceIndex + 1}`,
            trace.type ?? 'scatter',
        ];

        if (gridRows > 0 && gridColumns > 0) {
            for (let row = 0; row < gridRows; row += 1) {
                for (let column = 0; column < gridColumns; column += 1) {
                    const values = fields.map(field =>
                        availableFields.includes(field)
                            ? gridValue(
                                  trace[field],
                                  field,
                                  row,
                                  column,
                                  gridRows,
                                  gridColumns
                              )
                            : undefined
                    );
                    rows.push(
                        [...prefix, row * gridColumns + column, row, column, ...values]
                            .map(csvValue)
                            .join(',')
                    );
                }
            }
            return;
        }

        const pointCount = Math.max(
            0,
            ...availableFields.map(field => trace[field].length)
        );
        for (let point = 0; point < pointCount; point += 1) {
            rows.push(
                [
                    ...prefix,
                    point,
                    undefined,
                    undefined,
                    ...fields.map(field => trace[field]?.[point]),
                ]
                    .map(csvValue)
                    .join(',')
            );
        }
    });

    return rows.join('\r\n');
}

/** Serialize the current Plotly trace data without Plotly's private state. */
export function figureDataToJson(traces = []) {
    return JSON.stringify(traces, null, 2);
}

function figureFilename(graphDiv, extension) {
    const title =
        typeof graphDiv.layout?.title === 'string'
            ? graphDiv.layout.title
            : graphDiv.layout?.title?.text;
    const base = String(title || graphDiv.id || 'plot-data')
        .replace(/<[^>]*>/g, '')
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100);
    return `${base || 'plot-data'}.${extension}`;
}

function downloadBlob(graphDiv, contents, type, extension) {
    const blob = new Blob(contents, { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = figureFilename(graphDiv, extension);
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Download the currently plotted traces from a Plotly graph div as CSV. */
export function downloadFigureData(graphDiv) {
    downloadBlob(
        graphDiv,
        ['\ufeff', figureDataToCsv(graphDiv.data)],
        'text/csv;charset=utf-8',
        'csv'
    );
}

/** Download the currently plotted traces from a Plotly graph div as JSON. */
export function downloadFigureDataJson(graphDiv) {
    downloadBlob(
        graphDiv,
        [figureDataToJson(graphDiv.data), '\n'],
        'application/json;charset=utf-8',
        'json'
    );
}

/**
 * Create Plotly configuration with the per-figure data buttons appended.
 * Existing custom modebar buttons in `overrides` are preserved.
 */
export function createPlotConfig(overrides = {}) {
    const existingButtons = overrides.modeBarButtonsToAdd ?? [];
    return {
        ...overrides,
        modeBarButtonsToAdd: [
            ...existingButtons,
            {
                name: 'Download plotted data as CSV',
                icon: Plotly.Icons.disk,
                click: downloadFigureData,
            },
            {
                name: 'Download plotted data as JSON',
                icon: createJsonIcon,
                click: downloadFigureDataJson,
            },
        ],
    };
}
