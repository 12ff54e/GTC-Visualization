// The preview reuses one overlay canvas across snapshots. Replace its listener
// on each update so a theme change redraws only the most recent tick geometry.
const themeRedraws = new WeakMap();

function getTicks([min, max], num) {
    const get_exp = x => Math.floor(Math.log10(Math.abs(x)));
    const get_mantissa = (x, n) => x * Math.pow(10, -(n ?? get_exp(x)));
    const tweak_mantissa = (x, f, n) =>
        f(get_mantissa(x, n)) * Math.pow(10, n ?? get_exp(x));
    const truncated_mid_pt = tweak_mantissa(
        0.5 * (max + min), Math.floor,
        Math.max(get_exp(max), get_exp(min))
    );
    const step = tweak_mantissa(
        (2 * Math.max(truncated_mid_pt - min, max - truncated_mid_pt)) / num,
        x => 0.04 * Math.floor(25 * x)
    );
    return Array.from(
        { length: num - 1 },
        (_, idx) => (idx - 0.5 * (num - 2)) * step
    );
}

// Reserve canvas pixels for the complete labels, including signs and exponents.
// Both WebGL and the overlay use this box so the field keeps its aspect ratio.
export function poloidalPreviewBounds(ctx, { xRange, yRange, range, count }) {
    const padding = 12;
    const labelSpace = 5 + Math.max(
        ...getTicks(range, count).map(tick => ctx.measureText(tick.toExponential(2)).width)
    );
    const { width, height } = ctx.canvas;
    const scale = Math.min(
        (width - 2 * padding - labelSpace) / (xRange[1] - xRange[0]),
        (height - 2 * padding) / (yRange[1] - yRange[0])
    );
    return {
        center: [
            0.5 * (xRange[0] + xRange[1]) + labelSpace / (2 * scale),
            0.5 * (yRange[0] + yRange[1]),
        ],
        dim: [width / scale, height / scale],
    };
}

export function bindPoloidalColorbarTicks(ctx, { corner, dim, boundingBox, range, count }) {
    const redraw = () => {
        const { width, height } = ctx.canvas;
        const { center: [cx, cy], dim: [w, h] } = boundingBox;
        const scale = Math.min(width / w, height / h);
        const x = 5 + (corner[0] + dim[0] - cx) * scale + 0.5 * width;
        const dy = dim[1] / count;
        ctx.clearRect(0, 0, width, height);
        ctx.textBaseline = 'middle';
        // Canvas pixels do not inherit CSS text color automatically.
        ctx.fillStyle = getComputedStyle(ctx.canvas).color;
        getTicks(range, count).forEach((tick, index) => {
            const y = height - ((corner[1] + (index + 1) * dy - cy) * scale + 0.5 * height);
            ctx.fillText(tick.toExponential(2), x, y);
        });
    };
    const previous = themeRedraws.get(ctx.canvas);
    if (previous) window.removeEventListener('gtc-theme-change', previous);
    themeRedraws.set(ctx.canvas, redraw);
    window.addEventListener('gtc-theme-change', redraw);
    return redraw;
}
