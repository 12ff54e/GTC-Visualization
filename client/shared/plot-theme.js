/** Only presentation colors change; trace data, scales, zoom and camera stay intact. */
export function plotThemeUpdates(layout, colors) {
    const updates = {
        paper_bgcolor: colors.paper,
        plot_bgcolor: colors.plot,
        'font.color': colors.text,
        'title.font.color': colors.text,
        'legend.font.color': colors.text,
        'legend.bgcolor': colors.paper,
        'hoverlabel.bgcolor': colors.paper,
        'hoverlabel.bordercolor': colors.grid,
        'hoverlabel.font.color': colors.text,
    };
    (layout.updatemenus ?? []).forEach((menu, index) => {
        if (!menu) return;
        updates[`updatemenus[${index}].bgcolor`] = colors.paper;
        updates[`updatemenus[${index}].bordercolor`] = colors.grid;
        updates[`updatemenus[${index}].font.color`] = colors.text;
    });
    const axisColors = prefix => {
        for (const [key, color] of Object.entries({
            color: colors.text,
            gridcolor: colors.grid,
            zerolinecolor: colors.grid,
            linecolor: colors.grid,
            'tickfont.color': colors.text,
            'title.font.color': colors.text,
        })) {
            updates[`${prefix}.${key}`] = color;
        }
    };
    const axes = new Set([
        'xaxis',
        'yaxis',
        ...Object.keys(layout).filter(key => /^[xy]axis\d*$/.test(key)),
    ]);
    for (const axis of axes) {
        axisColors(axis);
        if (layout[axis]?.rangeslider) {
            updates[`${axis}.rangeslider.bgcolor`] = colors.plot;
        }
    }
    for (const key of Object.keys(layout)) {
        if (/^scene\d*$/.test(key)) {
            updates[`${key}.bgcolor`] = colors.plot;
            for (const axis of ['xaxis', 'yaxis', 'zaxis']) {
                axisColors(`${key}.${axis}`);
                updates[`${key}.${axis}.backgroundcolor`] = colors.plot;
            }
        }
        if (/^coloraxis\d*$/.test(key)) {
            updates[`${key}.colorbar.tickfont.color`] = colors.text;
            updates[`${key}.colorbar.title.font.color`] = colors.text;
        }
    }
    return updates;
}

export function themedLayout(layout = {}, colors) {
    const result = { ...layout };
    // Copy only branches whose colors change; never mutate the supplied layout.
    for (const [path, value] of Object.entries(plotThemeUpdates(layout, colors))) {
        const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
        const key = parts.pop();
        let target = result;
        for (const part of parts) {
            const existing = target[part];
            // Plotly also accepts a string title; retain its text when styling it.
            target[part] = Array.isArray(existing)
                ? existing.slice()
                : typeof existing === 'string'
                ? { text: existing }
                : { ...existing };
            target = target[part];
        }
        target[key] = value;
    }
    return result;
}

function plotColors() {
    const style = getComputedStyle(document.documentElement);
    const color = name => style.getPropertyValue(name).trim();
    return {
        paper: color('--plot-paper'),
        plot: color('--plot-bg'),
        text: color('--text-color'),
        grid: color('--plot-grid'),
    };
}

export function newThemedPlot(element, data, layout, config) {
    return Plotly.newPlot(
        element, data, themedLayout(layout, plotColors()), config
    );
}

export function reactThemedPlot(element, data, layout, config) {
    return Plotly.react(
        element, data, themedLayout(layout, plotColors()), config
    );
}

export function setupPlotTheme() {
    window.addEventListener('gtc-theme-change', () => {
        const colors = plotColors();
        document.querySelectorAll('.js-plotly-plot').forEach(graph => {
            if (graph.layout && graph.data) {
                Plotly.relayout(graph, plotThemeUpdates(graph.layout, colors))
                    .catch(error => console.error('Could not update plot theme', error));
            }
        });
    });
}
