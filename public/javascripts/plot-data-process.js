'use strict';

export async function historyMode(figures, interval1, interval2) {
    // deconstructing figures
    let [componentsFig, growthFig, freqFig, spectralFig] = figures;

    // growth rate figure
    let { gamma, measurePts } = cal_gamma(
        growthFig.data[0].y,
        window.GTCGlobal.timeStep,
        interval1
    );
    growthFig.data[1] = {
        x: [measurePts[0].x, measurePts[1].x],
        y: [measurePts[0].y, measurePts[1].y],
        type: 'scatter',
        line: { dash: 'dot', color: 'rgb(245, 10, 10)', width: 3 },
        markers: { color: 'rgb(255, 0, 0)', size: 8 },
    };
    growthFig.layout.title = `$\\gamma=${gamma.toPrecision(5)}$`;
    growthFig.layout.xaxis.rangeslider = {
        bgcolor: 'rgb(200,200,210)',
    };

    // frequency figure
    let y0 = componentsFig.data[0].y[0];
    y0 = y0 == 0 ? 1 : y0;
    let yReals = componentsFig.data[0].y.map(
        (y, i) =>
            y / (Math.exp(gamma * (i + 1) * window.GTCGlobal.timeStep) * y0)
    );
    let yImages = componentsFig.data[1].y.map(
        (y, i) =>
            y / (Math.exp(gamma * (i + 1) * window.GTCGlobal.timeStep) * y0)
    );
    let omega;
    ({ omega, measurePts } = cal_omega_r(
        yReals,
        yImages,
        window.GTCGlobal.timeStep,
        interval2
    ));
    freqFig.data[0] = {
        x: [...Array(yReals.length).keys()].map(
            i => (i + 1) * window.GTCGlobal.timeStep
        ),
        y: yReals,
        type: 'scatter',
        mode: 'lines',
    };
    freqFig.data[1] = {
        x: [...Array(yReals.length).keys()].map(
            i => (i + 1) * window.GTCGlobal.timeStep
        ),
        y: yImages,
        type: 'scatter',
        mode: 'lines',
    };
    freqFig.data[2] = {
        x: [measurePts[0].x, measurePts[1].x],
        y: [measurePts[0].y, measurePts[1].y],
        type: 'scatter',
        line: { dash: 'dot', color: 'rgb(245, 10, 10)', width: 3 },
        markers: { color: 'rgb(255, 0, 0)', size: 8 },
    };
    freqFig.layout.title = `$\\omega=${omega.toPrecision(5)}$`;
    freqFig.layout.xaxis.rangeslider = {
        bgcolor: 'rgb(200,200,210)',
    };

    // spectral figure
    let powerSpectrum = cal_spectrum(
        yReals,
        yImages,
        window.GTCGlobal.timeStep
    );
    spectralFig.data[0] = Object.assign(powerSpectrum, {
        type: 'scatter',
        mode: 'lines',
    });

    if (navigator.clipboard) {
        await navigator.clipboard.writeText(
            `${gamma.toPrecision(5)}, ${omega.toPrecision(5)}`
        );
    }
}

export async function snapshotSpectrum(figures) {
    const field = figures.pop().extraData;
    const torNum = field.length;
    const polNum = field[0].length;

    const mmode = Math.floor(polNum / 5);
    const pmode = Math.floor(torNum / 5);

    const modulo = (re, im) => Math.sqrt(re * re + im * im);

    const poloidalSpectrum = Array(mmode).fill(0);
    const planPol = new fftw['r2c']['fft1d'](polNum);
    for (let section of field) {
        const powerSpectrum = planPol.forward(section);
        poloidalSpectrum[0] += powerSpectrum[0];
        for (let i = 1; i < mmode; i++) {
            poloidalSpectrum[i] +=
                2 * modulo(powerSpectrum[2 * i], powerSpectrum[2 * i + 1]);
        }
    }
    planPol.dispose();

    function transpose(matrix) {
        let result = new Array(matrix[0].length);
        for (let i = 0; i < result.length; i++) {
            result[i] = matrix.map(line => line[i]);
        }
        return result;
    }

    const toroidalSpectrum = Array(pmode).fill(0);
    const planTor = new fftw['r2c']['fft1d'](torNum);
    for (let section of transpose(field)) {
        const powerSpectrum = planTor.forward(section);
        toroidalSpectrum[0] += powerSpectrum[0];
        for (let i = 1; i < pmode; i++) {
            toroidalSpectrum[i] +=
                2 * modulo(powerSpectrum[2 * i], powerSpectrum[2 * i + 1]);
        }
    }
    planTor.dispose();

    figures[0].data[0].x = [...Array(mmode).keys()];
    figures[0].data[0].y = poloidalSpectrum.map(
        v => Math.sqrt(v / torNum) / polNum
    );

    figures[1].data[0].x = [...Array(pmode).keys()];
    figures[1].data[0].y = toroidalSpectrum.map(
        v => Math.sqrt(v / polNum) / torNum
    );
}

export function snapshotPoloidal(figures, statusBar, safetyFactor) {
    const { polNum, radNum } = figures.pop();

    // add carpet indices

    const theta_mesh = [];
    const psi_mesh = [];
    for (let r = 0; r < radNum; ++r) {
        for (let p = 0; p <= polNum; ++p) {
            theta_mesh.push(p);
            psi_mesh.push(r);
        }
    }

    figures[0].data[0].a = theta_mesh;
    figures[0].data[0].b = psi_mesh;
    figures[0].data[1].a = theta_mesh;
    figures[0].data[1].b = psi_mesh;

    // draw diagnostic flux indicator

    const diagFluxLineColor = 'rgba(142.846, 176.35, 49.6957, 0.9)';

    const diagFlux =
        GTCGlobal.basicParameters.diag_flux ?? GTCGlobal.basicParameters.iflux;
    const diagnostic_flux_line = {
        name: 'Diagnostic Flux',
        mode: 'lines',
        line: {
            color: diagFluxLineColor,
            width: 3,
            shape: 'spline',
            smoothing: 1,
        },
        hoverinfo: 'none',
        type: 'scatter',
        showlegend: true,
        x: figures[0].data[0].x.slice(
            diagFlux * (polNum + 1),
            (diagFlux + 1) * (polNum + 1)
        ),
        y: figures[0].data[0].y.slice(
            diagFlux * (polNum + 1),
            (diagFlux + 1) * (polNum + 1)
        ),
    };

    figures[0].data.push(diagnostic_flux_line);

    // calculate spectrum profile on radial grids

    const flattenedField = figures[0].data[1].z;
    const selectedPoloidalModeNum = [
        ...new Set(window.GTCGlobal.basicParameters.mmodes),
    ];
    const modeNum = selectedPoloidalModeNum.length;
    if (Math.floor(polNum / 10) < Math.max(...selectedPoloidalModeNum)) {
        statusBar.warn = 'm modes in gtc.in is too high!';
    }

    const spectrumFigureData = [];
    for (let i = 0; i < 3 * modeNum; i++) {
        spectrumFigureData.push({
            y: [],
            name: `m = ${selectedPoloidalModeNum[Math.floor(i / 3)]}, ${
                i % 3 == 0 ? 'real' : i % 3 == 1 ? 'imag' : 'modulus'
            }`,
            showlegend: true,
            hoverinfo: 'none',
            visible: i % 3 == 2,
            max_: -Infinity,
            min_: Infinity,
        });
    }

    if (!window.GTCGlobal.fftPlan) {
        const planConstructor = fftw['r2c']['fft1d'];
        window.GTCGlobal.fftPlan = new planConstructor(polNum);
    }
    const plan = window.GTCGlobal.fftPlan;

    const extra_spectrum_data = Array.from({ length: polNum / 20 }, (_, i) => {
        return {
            y: [],
            name: `m = ${i}`,
            showlegend: false,
            hoverinfo: 'name',
            visible: false,
            max_: -Infinity,
        };
    });
    for (let r = 0; r < radNum; r++) {
        const circle = flattenedField.slice(r * polNum, (r + 1) * polNum);
        plan.forward(circle).forEach((amp, i) => {
            const mode_num = Math.floor(i / 2);
            if (mode_num < extra_spectrum_data.length) {
                const extra_trace = extra_spectrum_data[mode_num];
                if (i % 2 == 0) {
                    extra_trace.y.push(amp);
                } else {
                    const mod = Math.sqrt(
                        Math.pow(amp, 2) + Math.pow(extra_trace.y.pop(), 2)
                    );
                    extra_trace.y.push(mod);
                    extra_trace.max_ = Math.max(extra_trace.max_, mod);
                }
            }
            if (!selectedPoloidalModeNum.includes(mode_num)) {
                return;
            }
            const trace_index =
                3 * selectedPoloidalModeNum.indexOf(mode_num) + (i % 2);
            const trace = spectrumFigureData[trace_index];
            trace.y.push(amp);
            if (amp > trace.max_) {
                trace.max_ = amp;
            }
            if (amp < trace.min_) {
                trace.min_ = amp;
            }
            if (i % 2 == 1) {
                const modulus = Math.sqrt(
                    Math.pow(spectrumFigureData[trace_index - 1].y.at(-1), 2) +
                        Math.pow(trace.y.at(-1), 2)
                );
                const modulus_trace = spectrumFigureData[trace_index + 1];
                modulus_trace.y.push(modulus);
                if (modulus > modulus_trace.max_) {
                    modulus_trace.max_ = modulus;
                }
                if (modulus < modulus_trace.min_) {
                    modulus_trace.min_ = modulus;
                }
            }
        });
    }

    extra_spectrum_data
        .sort((a, b) => b.max_ - a.max_)
        .forEach((fig, ind) => {
            if (ind < 8) {
                fig.showlegend = true;
            }
        });

    let min_values = [Infinity, Infinity, Infinity];
    let max_values = [-Infinity, -Infinity, -Infinity];
    spectrumFigureData.forEach((trace, ind) => {
        max_values[ind % 3] =
            trace.max_ > max_values[ind % 3] ? trace.max_ : max_values[ind % 3];
        min_values[ind % 3] =
            trace.min_ < min_values[ind % 3] ? trace.min_ : min_values[ind % 3];
    });

    spectrumFigureData.push(...extra_spectrum_data);

    const extend_range = (a, b) => [1.1 * a - 0.1 * b, -0.1 * a + 1.1 * b];
    const limits = extend_range(
        Math.max(...max_values),
        Math.min(...min_values)
    );

    // add rational surface

    const rational_surface = getRationalSurface(
        safetyFactor,
        window.GTCGlobal.basicParameters.nmodes,
        window.GTCGlobal.basicParameters.mmodes
    );
    const RS_POINT_NUM = 20;
    spectrumFigureData.unshift(
        ...rational_surface.map(({ n, m, r }) => {
            const pos = window.GTCGlobal.basicParameters.mpsi * r;
            return {
                name: `${n},${m} surface`,
                x: Array(RS_POINT_NUM).fill(pos),
                y: Array.from({ length: RS_POINT_NUM }).map(
                    (_, i) =>
                        limits[0] +
                        ((limits[1] - limits[0]) * i) / (RS_POINT_NUM - 1)
                ),
                mode: 'lines',
                showlegend: false,
                hoverinfo: 'name',
                line: {
                    color: diagFluxLineColor,
                    dash: 'dash',
                    width: 1,
                },
            };
        })
    );

    // add diag flux indicator

    spectrumFigureData.unshift({
        name: 'Diagnostic Flux',
        x: [
            GTCGlobal.basicParameters.diag_flux,
            GTCGlobal.basicParameters.diag_flux,
        ],
        y: limits,
        mode: 'lines',
        showlegend: true,
        hoverinfo: 'none',
        line: {
            color: diagFluxLineColor,
            width: 3,
        },
    });

    // add control buttons
    // traces: diag flux | rational surfaces | selected m modes (real, imag, modulus) | some largest m modes
    const step3_pick = i =>
        Array.from(
            spectrumFigureData,
            (_, ind) =>
                ind < rational_surface.length + 1 ||
                ((ind - rational_surface.length - 1) % 3 == i &&
                    ind <
                        1 +
                            rational_surface.length +
                            3 * selectedPoloidalModeNum.length)
        );
    figures[1].data = spectrumFigureData;
    figures[1].layout.updatemenus = [
        {
            x: 0.05,
            xanchor: 'left',
            y: 0.9,
            yanchor: 'top',
            buttons: [
                ...[2, 0, 1].map(i => {
                    return {
                        method: 'update',
                        args: [
                            { visible: step3_pick(i) },
                            {
                                'xaxis.range': [
                                    0,
                                    window.GTCGlobal.basicParameters.mpsi,
                                ],
                                'yaxis.range': extend_range(
                                    min_values[i],
                                    max_values[i]
                                ),
                            },
                        ],
                        label: ['Even Parity', 'Odd Parity', 'Modulus'][i],
                    };
                }),
                ,
                {
                    method: 'update',
                    args: [
                        {
                            visible: Array.from(
                                spectrumFigureData,
                                (_, ind) =>
                                    ind < 1 + rational_surface.length ||
                                    ind >=
                                        1 +
                                            rational_surface.length +
                                            3 * selectedPoloidalModeNum.length
                            ),
                        },
                        {
                            'xaxis.range': [
                                0,
                                window.GTCGlobal.basicParameters.mpsi,
                            ],
                            'yaxis.range': extend_range(
                                0,
                                extra_spectrum_data[0].max_
                            ),
                        },
                    ],
                    label: 'Full',
                },
            ],
        },
    ];
    figures[1].layout.yaxis.range = extend_range(min_values[2], max_values[2]);
}

export async function trackingPlot(figures) {
    const zeta = figures.pop().extraData;

    const figureDiv1 = document.getElementById('figure-1');
    await Plotly.newPlot(figureDiv1, figures[0]);

    // Plotly will do the spline for me
    const [carpet, scatter] = figureDiv1.calcdata;

    Object.assign(figures[1].data[0], {
        x: scatter.map(({ x }, i) => x * Math.cos(zeta[i])),
        y: scatter.map(({ x }, i) => x * Math.sin(zeta[i])),
        z: scatter.map(({ y }) => y),
    });

    Plotly.newPlot('figure-2', figures[1]);
}

export function addSimulationRegion(fig) {
    const [rg0, rg1] = GTCGlobal.basicParameters.radial_region;
    const rgd =
        rg0 +
        (GTCGlobal.basicParameters.diag_flux / GTCGlobal.basicParameters.mpsi) *
            (rg1 - rg0);
    const data = fig.data[0].y;

    let y_min = Infinity,
        y_max = -Infinity;
    data.forEach(y => {
        if (y_min > y) {
            y_min = y;
        }
        if (y_max < y) {
            y_max = y;
        }
    });
    if (y_min == y_max) {
        y_max = y_min + 1;
    }

    const extendRegion = (x0, x1, s) => {
        return [x0 - s * (x1 - x0), x1 + s * (x1 - x0)];
    };

    const sep_props = {
        y: extendRegion(y_min, y_max, 0.2),
        mode: 'lines',
        line: {
            color: 'rgb(225, 156, 36)',
            width: 3,
        },
        showlegend: true,
    };
    fig.data.forEach(d => (d.showlegend = false));
    fig.data.push(
        // simulation region border
        {
            x: [rg0, rg0],
            ...sep_props,
            showlegend: false,
        },
        {
            name: 'Simulation Region',
            x: [rg1, rg1],
            fill: 'tonextx',
            ...sep_props,
        },
        // diagnostic flux
        {
            name: 'Diagnostic Flux',
            x: [rgd, rgd],
            ...sep_props,
            line: {
                color: 'rgb(143, 177, 49)',
                width: 2,
            },
        }
    );

    fig.layout.yaxis.range = extendRegion(y_min, y_max, 0.1);
}

/**
 * Calculate the growth rate of the time series array
 *
 * @param {Array<Number>} ys a series of data
 * @param {number} dt time step
 * @param {Array<Number>} interval
 *
 * @returns {{gamma: number, measurePts:{x:number, y:number}[]}}} growth rate
 */
export function cal_gamma(ys, dt, interval = [0.43, 0.98]) {
    let [tIni, tEnd] = interval;

    let tIniIndex = Math.floor(tIni * ys.length);
    let tEndIndex = Math.floor(tEnd * ys.length);

    let gamma =
        (Math.log(ys[tEndIndex]) - Math.log(ys[tIniIndex])) /
        ((tEndIndex - tIniIndex) * dt);

    let p1 = { x: (tIniIndex + 1) * dt, y: ys[tIniIndex] };
    let p2 = { x: (tEndIndex + 1) * dt, y: ys[tEndIndex] };

    return {
        gamma: gamma,
        measurePts: [p1, p2],
    };
}

/**
 * Calculate the frequency of the array
 *
 * @param {Array<Number>} yReals
 * @param {number} dt time step
 * @param {Array<Number>} interval
 *
 * @returns {{omega:number, measurePts:{x:number, y:number}[]}}
 */
export function cal_omega_r(yReals, yImages, dt, interval = [0.43, 0.98]) {
    let [tIni, tEnd] = interval;

    let tIniIndex = Math.floor(tIni * yReals.length);
    let tEndIndex = Math.floor(tEnd * yReals.length);

    // let maximums = ys.slice(tIniIndex, tEndIndex).filter((y, i, yn) => {
    //     return i > 0 && i < yn.length - 1
    //         && y[1] > yn[i - 1][1] && y[1] > yn[i + 1][1];
    // })
    let maximums = new Array();
    // yReals.slice(tIniIndex, tEndIndex).forEach((y, i, arr) => {
    //     if (i > 0 && i < arr.length - 1 && y > arr[i - 1] && y > arr[i + 1]) {
    //         maximums.push([i + tIniIndex, y]);
    //     }
    // });

    const section = [];
    for (let i = tIniIndex; i < tEndIndex; ++i) {
        section.push((yReals[i - 1] + yReals[i] + yReals[i + 1]) / 3);
    }
    section.forEach((y, i, arr) => {
        if (i > 0 && i < arr.length - 1 && y > arr[i - 1] && y > arr[i + 1]) {
            maximums.push([i + tIniIndex, y]);
        }
    });

    let omega;
    let periodNum = maximums.length - 1;
    let p1 = { x: null, y: null };
    let p2 = { x: null, y: null };
    if (periodNum < 1) {
        omega = 0;
    } else {
        p1.x = (maximums[0][0] + 1) * dt;
        p1.y = maximums[0][1];
        p2.x = (maximums[maximums.length - 1][0] + 1) * dt;
        p2.y = maximums[maximums.length - 1][1];
        omega = (2 * Math.PI * periodNum) / (p2.x - p1.x);
    }

    return {
        omega: omega,
        measurePts: [p1, p2],
    };
}

/**
 * Calculate power spectrum, asynchronously
 *
 * @param {Array<Number>} reals
 * @param {Array<Number>} images
 * @param {number} timeStep
 *
 * @returns {{x: Array<Number>, y: Array<Number>}} power spectrum
 */
export function cal_spectrum(reals, images, timeStep) {
    const plan = new fftw['c2c']['fft1d'](reals.length);

    const spectrum = unInterleave(plan.forward(interleave(reals, images))).map(
        ([re, im]) => Math.sqrt(re * re + im * im)
    );

    plan.dispose();

    const len = reals.length;
    const halfLen = Math.floor(len / 2);

    return {
        x: [...Array(len).keys()].map(
            i => ((2 * Math.PI) / (len * timeStep)) * (i - halfLen)
        ),
        y: Array.from(spectrum.slice(len - halfLen)).concat(
            Array.from(spectrum.slice(0, len - halfLen))
        ),
    };
}

function interleave(as, bs) {
    return as.flatMap((val, idx) => [val, bs[idx]]);
}

function unInterleave(cs) {
    return cs.reduce((arr, val, idx) => {
        if (idx % 2 == 0) {
            arr.push([val]);
        } else {
            arr.at(-1).push(val);
        }
        return arr;
    }, []);
}

function getRationalSurface(safetyFactor, n_modes, m_modes) {
    const mode_num = n_modes
        .map((n, i) => {
            return { n: n, m: m_modes[i] };
        })
        .sort((a, b) => a.m / a.n - b.m / b.n)
        .filter(function (item, pos, ary) {
            const last_item = ary[!pos ? 0 : pos - 1];
            return !pos || item.m * last_item.n != item.n * last_item.m;
        });
    const linear_map = (t, x0, x1, y0, y1) =>
        y0 + ((y1 - y0) * (t - x0)) / (x1 - x0);

    const result = [];
    const [r0, r1] = window.GTCGlobal.basicParameters.radial_region;
    for (let i = 0; i < safetyFactor.x.length - 1; ++i) {
        if (safetyFactor.x[i + 1] < r0 || safetyFactor.x[i] > r1) {
            continue;
        }
        mode_num.forEach(mode => {
            const pos = linear_map(
                mode.m / mode.n,
                safetyFactor.y[i],
                safetyFactor.y[i + 1],
                safetyFactor.x[i],
                safetyFactor.x[i + 1]
            );
            if (pos >= safetyFactor.x[i] && pos < safetyFactor.x[i + 1]) {
                result.push({ r: (pos - r0) / (r1 - r0), ...mode });
            }
        });
    }
    return result;
}
