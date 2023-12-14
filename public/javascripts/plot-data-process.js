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

export async function snapshotPoloidal(figures) {
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
    const modeNum = Math.floor(polNum / 10);

    const spectrumFigureData = figures[1].data;
    for (let i = 0; i < modeNum; i++) {
        spectrumFigureData.push({
            y: [],
            name: `m = ${i}`,
            showlegend: false,
            hoverinfo: 'none',
            max_: -Infinity,
            max_idx_: 0,
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
                    if (p > trace.max_) {
                        trace.max_ = p;
                        trace.max_idx_ = i;
                    }
                }
            });
    }

    plan.dispose();

    spectrumFigureData
        .sort((u, v) => {
            return v.max_ - u.max_;
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
        showlegend: true,
        line: {
            color: diagFluxLineColor,
            width: 3,
        },
    });

    if (1) {
        await drawPoloidalData({
            radNum,
            polNum,
            x: figures[0].data[0].x,
            y: figures[0].data[0].y,
            z: figures[0].data[1].z,
        });
        figures[0] = { layout: {} };
    }
}

async function drawPoloidalData(data) {
    // create canvas

    const create_canvas = id => {
        const canvas = document.createElement('canvas');
        canvas.id = id;
        canvas.width = canvas.height = 700;
        return canvas;
    };
    document.querySelector('canvas#pol-canvas');
    const figure_canvas = create_canvas('pol-canvas');
    const overlay_canvas = create_canvas('pol-canvas-overlay');

    document
        .querySelector('#figure-1')
        .replaceChildren(figure_canvas, overlay_canvas);

    // webgl2 context
    const gl = figure_canvas.getContext('webgl2');
    if (!gl) {
        throw 'Your browser do not support webgl2!';
    }

    // 2d context for frame an ticks
    const ctx = overlay_canvas.getContext('2d');
    ctx.font = '24px serif';

    const { radNum, polNum, x, y, z } = data;
    // find bounding box
    const [x_min, x_max] = min_max(x.slice((radNum - 1) * (polNum + 1)));
    const [y_min, y_max] = min_max(y.slice((radNum - 1) * (polNum + 1)));
    const z_range = min_max(z);

    // create color map texture

    // ColorData["ThermometerColors"] from Mathematica
    const color_map_data = new Uint8Array([
        41, 30, 202, 87, 113, 234, 151, 191, 241, 203, 226, 225, 229, 217, 188,
        224, 168, 137, 191, 91, 86, 136, 21, 42,
    ]);
    const legend_width = 0.1 * (x_max - x_min);
    const legend_left_padding = 0.1 * (x_max - x_min);
    const color_map = createColorMap(
        gl,
        color_map_data,
        [x_max + legend_left_padding, y_min + 0.1 * (y_max - y_min)],
        [legend_width, 0.8 * (y_max - y_min)],
        z_range
    );

    // bounding box should be aware of color map

    const x_max_total = x_max + legend_left_padding + legend_width;
    const bounding_box = {
        center: [0.5 * (x_min + x_max_total), 0.5 * (y_min + y_max)],
        // add padding through slightly stretch the bounding box dimension
        dim: [1.05 * (x_max_total - x_min), 1.05 * (y_max - y_min)],
        z_range,
    };

    // create shader program
    const shader_program = buildShaderProgram(gl, [
        {
            type: gl.VERTEX_SHADER,
            code: await (await fetch('/shader/pol.vert')).text(),
        },
        {
            type: gl.FRAGMENT_SHADER,
            code: await (await fetch('/shader/pol.frag')).text(),
        },
    ]);

    // set uniforms
    gl.useProgram(shader_program);
    for (const [key, val] of Object.entries(bounding_box)) {
        gl.uniform2f(gl.getUniformLocation(shader_program, key), ...val);
    }
    gl.uniform2f(
        gl.getUniformLocation(shader_program, 'resolution'),
        figure_canvas.width,
        figure_canvas.height
    );
    // bind texture sampler
    gl.uniform1i(gl.getUniformLocation(shader_program, 'color_map'), 0);

    const grid_num = radNum * (polNum + 1);
    const color_map_vertex_num = 2 * (color_map_data.length / 3 - 1);
    const grid_coords = new Float32Array((grid_num + color_map_vertex_num) * 3);
    for (let i = 0; i < grid_num; ++i) {
        grid_coords[i * 3] = x[i];
        grid_coords[i * 3 + 1] = y[i];
        grid_coords[i * 3 + 2] = z[i];
    }
    const element_num = 2 * (polNum + 1) * (radNum - 1);
    const triangle_stride_vertex_indices = new Uint32Array(element_num);
    for (let r = 0; r < radNum - 1; ++r) {
        for (let p = 0; p <= polNum; ++p) {
            const idx = r * (polNum + 1) + p;
            triangle_stride_vertex_indices[2 * idx] = idx;
            triangle_stride_vertex_indices[2 * idx + 1] = idx + (polNum + 1);
        }
    }

    // create vertex array object for contour

    const VAO = gl.createVertexArray();
    gl.bindVertexArray(VAO);

    // create buffers, initialize their data store

    const VBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
    gl.bufferData(gl.ARRAY_BUFFER, grid_coords, gl.STREAM_DRAW);

    const EBO = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, EBO);
    gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        triangle_stride_vertex_indices,
        gl.STREAM_DRAW
    );

    // set vertex attribute

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, 0, 0, 0);

    // specify color map texture
    color_map.bindToTextureUnit(gl.TEXTURE0);

    // Clear canvas with white background color
    gl.clearColor(1, 1, 1, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // draw call
    gl.bindVertexArray(VAO);
    gl.drawElements(gl.TRIANGLE_STRIP, element_num, gl.UNSIGNED_INT, 0);
    color_map.draw();
}

/**
 *
 * @param {WebGL2RenderingContext} gl
 */
function buildShaderProgram(gl, shader_info) {
    const program = gl.createProgram();

    function compileShader(type, code) {
        const shader = gl.createShader(type);

        gl.shaderSource(shader, code);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.log(
                `Error compiling ${
                    type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'
                } shader:`
            );
            console.log(gl.getShaderInfoLog(shader));
        }
        return shader;
    }

    shader_info.forEach(({ type, code }) => {
        const shader = compileShader(type, code);

        if (shader) {
            gl.attachShader(program, shader);
        }
    });

    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.log('Error linking shader program:');
        console.log(gl.getProgramInfoLog(program));
    }

    return program;
}

/**
 *
 * @param {WebGL2RenderingContext} gl
 * @param {Uint8Array} data
 * @param {[number, number]} corner lower left corner
 * @param {[number, number]} dim
 * @param {[number, number]} z_range
 */
function createColorMap(gl, data, corner, dim, z_range) {
    const color_map_texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, color_map_texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texImage2D(...packTexArgs(gl, data));

    // As far as I'm using another draw call for color map, creating separate vbo/ebo
    //  for it should not be a performance issue.

    const VAO = gl.createVertexArray();
    gl.bindVertexArray(VAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());

    const color_num = data.length / 3;

    // geometry thingy

    const [x0, y0] = corner;
    const x1 = x0 + dim[0];
    const dy = dim[1] / color_num;

    const [z0, z1] = z_range;
    const dz = (z1 - z0) / color_num;

    const vertex_data = new Float32Array(3 * 4 * color_num);
    const element_data = new Int32Array(3 * 2 * color_num);
    for (let i = 0; i < 2 * color_num; ++i) {
        vertex_data[3 * (2 * i)] = x0;
        vertex_data[3 * (2 * i) + 1] = y0 + Math.floor((i + 1) / 2) * dy;
        vertex_data[3 * (2 * i) + 2] = z0 + (Math.floor(i / 2) + 0.5) * dz;

        vertex_data[3 * (2 * i + 1)] = x1;
        vertex_data[3 * (2 * i + 1) + 1] = y0 + Math.floor((i + 1) / 2) * dy;
        vertex_data[3 * (2 * i + 1) + 2] = z0 + (Math.floor(i / 2) + 0.5) * dz;

        const idx = Math.floor((4 * Math.floor((i * 3) / 2)) / 3);
        element_data[3 * i] = idx;
        element_data[3 * i + 1] = idx + 1;
        element_data[3 * i + 2] = idx + 2;
    }

    // initial data store for buffers

    gl.bufferData(gl.ARRAY_BUFFER, vertex_data, gl.STREAM_DRAW);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, element_data, gl.STREAM_DRAW);

    // set vertex attribute

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, 0, 0, 0);

    return {
        /**
         * @param {number} texture
         */
        bindToTextureUnit: function (texture) {
            gl.activeTexture(texture);
            gl.bindTexture(gl.TEXTURE_2D, color_map_texture);
        },
        draw: function () {
            this.bindToTextureUnit(gl.TEXTURE0);
            gl.bindVertexArray(VAO);
            gl.drawElements(gl.TRIANGLES, color_num * 6, gl.UNSIGNED_INT, 0);
        },
    };
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
        GTCGlobal.basicParameters.diag_flux / GTCGlobal.basicParameters.mpsi;
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

function min_max(arr) {
    return arr.reduce(
        ([min, max], curr) => [Math.min(min, curr), Math.max(max, curr)],
        [Infinity, -Infinity]
    );
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {Uint8Array} data
 */
function packTexArgs(gl, data) {
    return [
        gl.TEXTURE_2D,
        0,
        gl.RGB,
        data.length / 3,
        1,
        0,
        gl.RGB,
        gl.UNSIGNED_BYTE,
        data,
    ];
}
