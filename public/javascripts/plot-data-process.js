'use strict';
import * as spectrum from './spectrum.js';

export async function historyMode(figures, interval1, interval2) {
    // deconstructing figures
    let [componentsFig, growthFig, freqFig, spectralFig] = figures;

    // growth rate figure
    let { gamma, measurePts } = spectrum.cal_gamma(
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
    ({ omega, measurePts } = spectrum.cal_omega_r(
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
    let powerSpectrum = spectrum.cal_spectrum(
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

    const diag_flux = GTCGlobal.basicParameters.diag_flux;
    const diagnostic_flux_line = {
        name: 'Diagnostic Flux',
        mode: 'lines',
        line: {
            color: 'rgba(142.846, 176.35, 49.6957, 0.9)',
            width: 3,
            shape: 'spline',
            smoothing: 1,
        },
        hoverinfo: 'none',
        type: 'scatter',
        showlegend: true,
        x: figures[0].data[0].x.slice(
            diag_flux * (polNum + 1),
            (diag_flux + 1) * (polNum + 1)
        ),
        y: figures[0].data[0].y.slice(
            diag_flux * (polNum + 1),
            (diag_flux + 1) * (polNum + 1)
        ),
    };

    figures[0].data.push(diagnostic_flux_line);

    // calculate spectrum profile on radial grids

    const flattenedField = figures[0].data[1].z;
    const modeNum = Math.floor(polNum / 10);

    const spectrum_figure_data = figures[1].data;
    for (let i = 0; i < modeNum; i++) {
        spectrum_figure_data.push({
            y: [],
            name: `m = ${i}`,
            showlegend: false,
            hoverinfo: 'none',
            total: 0,
        });
    }

    const planConstructor = fftw['r2c']['fft1d'];
    const plan = new planConstructor(polNum);

    for (let r = 0; r < radNum; r++) {
        const circle = flattenedField.slice(r * polNum, (r + 1) * polNum);
        plan.forward(circle)
            .slice(0, 2 * modeNum)
            .forEach((amp, i) => {
                if (i % 2 == 0) {
                    spectrum_figure_data[i / 2].y.push(amp);
                } else {
                    let p = spectrum_figure_data[(i - 1) / 2].y.pop();
                    p = Math.sqrt(p * p + amp * amp);
                    spectrum_figure_data[(i - 1) / 2].total += p;
                    spectrum_figure_data[(i - 1) / 2].y.push(p);
                }
            });
    }

    plan.dispose();

    spectrum_figure_data
        .sort((u, v) => {
            return v.total - u.total;
        })
        .some((d, i) => {
            d.showlegend = true;
            return i > 6;
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
