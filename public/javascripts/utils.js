export function interleave(as, bs) {
    return as.flatMap((val, idx) => [val, bs[idx]]);
}

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

export function min_max(arr, margin = 0) {
    return ((min, max) => [
        min - (max - min) * margin,
        max + (max - min) * margin,
    ])(
        ...arr.reduce(
            ([min, max], curr) => [Math.min(min, curr), Math.max(max, curr)],
            [Infinity, -Infinity]
        )
    );
}

export function nodeIs(node, predict) {
    if (node) {
        return predict(node) || nodeIs(node.parentElement, predict);
    }
}

export function zip(func, ...arrays) {
    return arrays[0].map((_, i) => func(...arrays.map(arr => arr[i])));
}

export function lerp(a, b, x) {
    return a + (b - a) * x;
}

export function linearMap(x, a0, b0, a1, b1) {
    return lerp(a1, b1, (x - a0) / (b0 - a0));
}

export function lower_bound(array, val) {
    let idx = 0;
    let step = array.length;

    while (step > 0) {
        const half = Math.floor(step / 2);
        if (array[idx + half] > val) {
            step = half;
        } else {
            idx = idx + half + 1;
            step = step - half - 1;
        }
    }

    return idx;
}

export function interpolationDerivativeAt(x, xs, ys) {
    const idx = lower_bound(xs, x) - 1;

    let d = 0;
    if (idx == 0 || idx == xs.length - 2) {
        d = (ys[idx + 1] - ys[idx]) / (xs[idx + 1] - xs[idx]);
    } else {
        const threePairSum = (a, b, c) => {
            return a * b + b * c + c * a;
        };
        const x3 = 3 * x * x;
        const xSum = xs[idx - 1] + xs[idx] + xs[idx + 1] + xs[idx + 2];
        for (let i = 0; i < 4; ++i) {
            const localXS = xs.slice(idx - 1, idx + 3);
            const [localX] = localXS.splice(i, 1);
            let coef = x3 - 2 * x * (xSum - localX) + threePairSum(...localXS);
            coef /= localXS.reduce((acc, val) => acc * (localX - val), 1);
            d += coef * ys[idx - 1 + i];
        }
    }

    return d;
}

export function derivative(xs, ys) {
    const d = xs.map(_ => 0);
    let dx0 = xs[1] - xs[0];
    let dx1 = xs[2] - xs[1];
    let dx = dx0 + dx1;
    d[0] =
        (-ys[0] * dx1 * (dx + dx0) + ys[1] * dx * dx - ys[2] * dx0 * dx0) /
        (dx0 * dx1 * dx);
    for (let i = 1; i < xs.length - 1; ++i) {
        if (i != 1) {
            dx0 = dx1;
            dx1 = xs[i + 1] - xs[i];
            dx = dx0 + dx1;
        }
        d[i] =
            (-ys[i - 1] * dx1 * dx1 +
                ys[i] * dx * (dx1 - dx0) +
                ys[i + 1] * dx0 * dx0) /
            (dx0 * dx1 * dx);
    }
    d[xs.length - 1] =
        (ys[xs.length - 3] * dx0 * dx0 -
            ys[xs.length - 2] * dx * dx +
            ys[xs.length - 1] * dx1 * (dx + dx0)) /
        (dx0 * dx1 * dx);
    return d;
}

export function merge(arr, compare_fn = (a, b) => a - b) {
    const shallow_copy = [];
    const result = [];
    // nonempty check
    arr.forEach(subarr => {
        if (subarr.length > 0) {
            shallow_copy.push(subarr);
        }
    });
    const iter_indices = shallow_copy.map(_ => 0);

    while (iter_indices.length > 0) {
        const idx_current_min_array = iter_indices.reduce(
            (prev, current, idx) => {
                return compare_fn(
                    shallow_copy[idx][current],
                    shallow_copy[prev][iter_indices[prev]]
                ) < 0
                    ? idx
                    : prev;
            },
            0
        );
        result.push(
            shallow_copy[idx_current_min_array][
                iter_indices[idx_current_min_array]
            ]
        );
        // delete drained array
        if (
            ++iter_indices[idx_current_min_array] ==
            shallow_copy[idx_current_min_array].length
        ) {
            iter_indices.splice(idx_current_min_array, 1);
            shallow_copy.splice(idx_current_min_array, 1);
        }
    }
    return result;
}

export function delete_duplicates(
    arr,
    compare_fn = (a, b) => a - b,
    transform_fn = a => a[0]
) {
    const tmp = [];
    const result = [];
    for (let i = 0; i < arr.length; ) {
        const elem = arr[i];
        if (tmp.length == 0) {
            tmp.push(elem);
            i++;
        } else if (compare_fn(elem, tmp.at(-1)) == 0) {
            tmp.push(elem);
            i++;
        } else {
            result.push(transform_fn(tmp));
            tmp.length = 0;
        }
    }
    if (tmp.length > 0) {
        result.push(transform_fn(tmp));
    }
    return result;
}