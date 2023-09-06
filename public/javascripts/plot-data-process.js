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

export function snapshotPoloidal(figures) {
    const { polNum, radNum } = figures.pop();

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
    const modeNum = Math.floor(polNum / 10);

    const spectrumFigureData = figures[1].data;
    for (let i = 0; i < modeNum; i++) {
        spectrumFigureData.push({
            y: [],
            name: `m = ${i}`,
            showlegend: false,
            legendgroup: 'lg2',
            hoverinfo: 'none',
            total_: 0,
            max_: -Infinity,
        });
    }

    const planConstructor = fftw['r2c']['fft1d'];
    const plan = new planConstructor(polNum);

    for (let r = 0; r < radNum; r++) {
        const circle = flattenedField.slice(r * polNum, (r + 1) * polNum);
        plan.forward(circle)
            .slice(0, 2 * modeNum)
            .forEach((amp, i) => {
                const trace = spectrumFigureData[Math.floor(i / 2)];
                if (i % 2 == 0) {
                    spectrumFigureData[i / 2].y.push(amp);
                } else {
                    let p = trace.y.pop();
                    p = Math.sqrt(p * p + amp * amp);
                    trace.y.push(p);
                    trace.total_ += p;
                    trace.max_ = p > trace.max_ ? p : trace.max_;
                }
            });
    }

    plan.dispose();

    spectrumFigureData
        .sort((u, v) => {
            return v.total_ - u.total_;
        })
        .some((d, i) => {
            d.showlegend = true;
            return i > 6;
        });

    // add diag flux indicator

    spectrumFigureData.unshift({
        name: 'Diagnostic Flux',
        x: [
            GTCGlobal.basicParameters.diag_flux,
            GTCGlobal.basicParameters.diag_flux,
        ],
        y: [0, spectrumFigureData[0].max_ * 1.1],
        mode: 'lines',
        legendgroup: 'lg1',
        showlegend: true,
        line: {
            color: diagFluxLineColor,
            width: 3,
        },
    });
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
    const [rg0, rg1] = window.GTCGlobal.basicParameters.radial_region;
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
    const sep_props = {
        y: [y_min - 0.2 * (y_max - y_min), y_max + 0.2 * (y_max - y_min)],
        mode: 'lines',
        line: {
            color: 'rgb(143, 177, 50)',
            width: 3,
        },
    };
    fig.data.push(
        {
            x: [rg0, rg0],
            ...sep_props,
        },
        {
            x: [rg1, rg1],
            fill: 'tonextx',
            ...sep_props,
        }
    );

    fig.layout.yaxis.range = [
        y_min - 0.1 * (y_max - y_min),
        y_max + 0.1 * (y_max - y_min),
    ];
    fig.layout.showlegend = false;
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
