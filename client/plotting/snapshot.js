'use strict';

/**
 * Snapshot module for the GTC Visualization plot page.
 *
 * Handles everything related to snapshot data:
 *   - Pre-processing (spectrum dispatch, safety-factor fetch)
 *   - FFT-based poloidal/toroidal spectrum analysis
 *   - Poloidal plane rendering (Plotly carpets + WebGL preview)
 *   - Snapshot player (frame-by-frame animation)
 *
 * ## Public API
 *
 *   `snapshotPreprocess(btn, figures)`          — called from getDataThenPlot
 *   `addSnapshotPlayer(panel, createGroup, openPanel, getData)` — called from openPanel
 *   `snapshotPoloidalPreview(figures)`          — called from openPanel (hover)
 *
 * @module snapshot
 */

import state from '../control/state.js';
import { requestPlotData } from '../shared/api.js';
import { getStatusBar } from '../components/status-bar.js';
import { getFFT } from '../shared/fft.js';
import { min_max } from '../shared/util.js';

// ==================================================================
//  Internal helpers
// ==================================================================

/**
 * @param {WebGL2RenderingContext} gl
 * @param {Uint8Array} data
 */
function packTextureArgs(gl, data) {
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

function getTicks([min, max], num) {
    const get_exp = x => Math.floor(Math.log10(Math.abs(x)));
    const get_mantissa = (x, n) => x * Math.pow(10, -(n ?? get_exp(x)));

    const tweak_mantissa = (x, f, n) =>
        f(get_mantissa(x, n)) * Math.pow(10, n ?? get_exp(x));

    const truncated_mid_pt = tweak_mantissa(
        0.5 * (max + min),
        Math.floor,
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
    const [r0, r1] = state.basicParameters.radial_region;
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

// ==================================================================
//  WebGL helpers
// ==================================================================

/**
 * @param {WebGL2RenderingContext} gl
 * @param {{type: number, code: string}[]} shader_info
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
 * @param {WebGL2RenderingContext} gl
 * @param {CanvasRenderingContext2D} ctx For drawing ticks
 * @param {Uint8Array} data
 * @param {[number, number]} corner lower left corner
 * @param {[number, number]} dim width and height
 * @param {{center:[number, number], dim:[number, number], z_range:[number, number]}} bounding_box
 * @param {[number, number]} z_range
 */
function createColorMap(gl, ctx, data, corner, dim, bounding_box, z_range) {
    const color_map_texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, color_map_texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texImage2D(...packTextureArgs(gl, data));

    const VAO = gl.createVertexArray();
    gl.bindVertexArray(VAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());

    const color_num = data.length / 3;

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

    gl.bufferData(gl.ARRAY_BUFFER, vertex_data, gl.STREAM_DRAW);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, element_data, gl.STREAM_DRAW);

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

            ctx.textBaseline = 'middle';
            const ticks = getTicks(z_range, color_num);
            const canvas_width = ctx.canvas.width;
            const canvas_height = ctx.canvas.height;
            ctx.clearRect(0, 0, canvas_width, canvas_height);

            const {
                center: [cx, cy],
                dim: [w, h],
            } = bounding_box;
            const tick_x =
                5 +
                (x1 - cx) * Math.min(canvas_width / w, canvas_height / h) +
                0.5 * canvas_width;

            ticks.forEach((tick, idx) => {
                const tick_y =
                    canvas_height -
                    ((y0 + (idx + 1) * dy - cy) *
                        Math.min(canvas_width / w, canvas_height / h) +
                        0.5 * canvas_height);
                const label = tick.toExponential(2);
                ctx.fillText(label, tick_x, tick_y);
            });
        },
    };
}

// ==================================================================
//  Poloidal drawing (Plotly / WebGL)
// ==================================================================

function drawPoloidalDataPlotly(
    figure,
    rad_num,
    pol_num,
    diag_flux,
    diag_line_color
) {
    const theta_mesh = [];
    const psi_mesh = [];
    for (let r = 0; r < rad_num; ++r) {
        for (let p = 0; p <= pol_num; ++p) {
            theta_mesh.push(p);
            psi_mesh.push(r);
        }
    }

    figure.data[0].a = theta_mesh;
    figure.data[0].b = psi_mesh;
    figure.data[1].a = theta_mesh;
    figure.data[1].b = psi_mesh;

    const diagnostic_flux_line = {
        name: 'Diagnostic Flux',
        mode: 'lines',
        line: {
            color: diag_line_color,
            width: 3,
            shape: 'spline',
            smoothing: 1,
        },
        hoverinfo: 'none',
        type: 'scatter',
        showlegend: true,
        x: figure.data[0].x.slice(
            diag_flux * (pol_num + 1),
            (diag_flux + 1) * (pol_num + 1)
        ),
        y: figure.data[0].y.slice(
            diag_flux * (pol_num + 1),
            (diag_flux + 1) * (pol_num + 1)
        ),
    };

    figure.data.push(diagnostic_flux_line);
}

// TODO: With in on gtc output folder, the only thing changes is data.z, thus we can reuse everything except for the VBO
/**
 * @param {HTMLDivElement} container
 * @param {{radNum: number, polNum:number, x:[number], y:[number], z:[number]}} data
 */
async function drawPoloidalDataWebGL(container, data) {
    const create_canvas = id => {
        const canvas = document.createElement('canvas');
        canvas.id = id;
        canvas.width = canvas.height = 700;
        return canvas;
    };
    const figure_canvas = (id =>
        document.getElementById(id) ?? create_canvas(id))('pol-canvas');
    const overlay_canvas = (id =>
        document.getElementById(id) ?? create_canvas(id))('pol-canvas-overlay');
    if (container.childElementCount == 0) {
        container.append(figure_canvas, overlay_canvas);
    }

    const gl = figure_canvas.getContext('webgl2', { alpha: true });
    if (!gl) {
        throw 'Your browser do not support webgl2!';
    }

    const ctx = overlay_canvas.getContext('2d');
    ctx.font = '24px serif';

    const { radNum, polNum, x, y, z } = data;
    const [x_min, x_max] = min_max(x.slice((radNum - 1) * (polNum + 1)));
    const [y_min, y_max] = min_max(y.slice((radNum - 1) * (polNum + 1)));
    const z_range = min_max(z);

    const color_map_data = new Uint8Array([
        45, 77, 238, 97, 122, 242, 150, 166, 246, 202, 210, 250, 255, 255, 255,
        243, 199, 201, 231, 144, 148, 220, 89, 95, 208, 34, 41,
    ]);
    const legend_width = 0.1 * (x_max - x_min);
    const legend_left_padding = 0.1 * (x_max - x_min);

    const x_max_total = x_max + legend_left_padding + legend_width;
    const bounding_box = {
        center: [0.5 * (x_min + x_max_total), 0.5 * (y_min + y_max)],
        dim: [1.05 * (x_max_total - x_min), 1.05 * (y_max - y_min)],
        z_range,
    };

    const color_map = createColorMap(
        gl,
        ctx,
        color_map_data,
        [x_max + legend_left_padding, y_min + 0.1 * (y_max - y_min)],
        [legend_width, 0.8 * (y_max - y_min)],
        bounding_box,
        z_range
    );

    const shader_program =
        container.gl_shader ??
        buildShaderProgram(gl, [
            {
                type: gl.VERTEX_SHADER,
                code: await (await fetch('/shader/pol.vert')).text(),
            },
            {
                type: gl.FRAGMENT_SHADER,
                code: await (await fetch('/shader/pol.frag')).text(),
            },
        ]);

    container.gl_shader = shader_program;

    gl.useProgram(shader_program);
    for (const [key, val] of Object.entries(bounding_box)) {
        gl.uniform2f(gl.getUniformLocation(shader_program, key), ...val);
    }
    gl.uniform2f(
        gl.getUniformLocation(shader_program, 'resolution'),
        figure_canvas.width,
        figure_canvas.height
    );
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

    const VAO = gl.createVertexArray();
    gl.bindVertexArray(VAO);

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

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, 0, 0, 0);

    color_map.bindToTextureUnit(gl.TEXTURE0);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindVertexArray(VAO);
    gl.drawElements(gl.TRIANGLE_STRIP, element_num, gl.UNSIGNED_INT, 0);
    color_map.draw();
}

// ==================================================================
//  Exported: data processing
// ==================================================================

export async function snapshotSpectrum(figures) {
    const field = figures.pop().extraData;
    const torNum = field.length;
    const polNum = field[0].length;

    const mmodes = Math.floor(polNum / 5);
    const nmodes = Math.floor(torNum / 5);

    const modulo = (re, im) => Math.sqrt(re * re + im * im);
    const fft = await getFFT();

    const poloidalSpectrum = Array(mmodes).fill(0);
    for (let section of field) {
        const powerSpectrum = fft.r2c1d(section);
        poloidalSpectrum[0] += powerSpectrum[0];
        for (let i = 1; i < mmodes; i++) {
            poloidalSpectrum[i] +=
                2 * modulo(powerSpectrum[2 * i], powerSpectrum[2 * i + 1]);
        }
    }

    function transpose(matrix) {
        let result = new Array(matrix[0].length);
        for (let i = 0; i < result.length; i++) {
            result[i] = matrix.map(line => line[i]);
        }
        return result;
    }

    const toroidalSpectrum = Array(nmodes).fill(0);
    for (let section of transpose(field)) {
        const powerSpectrum = fft.r2c1d(section);
        toroidalSpectrum[0] += powerSpectrum[0];
        for (let i = 1; i < nmodes; i++) {
            toroidalSpectrum[i] +=
                2 * modulo(powerSpectrum[2 * i], powerSpectrum[2 * i + 1]);
        }
    }

    figures[0].data[0].x = [...Array(mmodes).keys()];
    figures[0].data[0].y = poloidalSpectrum.map(
        v => Math.sqrt(v / torNum) / polNum
    );

    figures[1].data[0].x = [...Array(nmodes).keys()];
    figures[1].data[0].y = toroidalSpectrum.map(
        v => Math.sqrt(v / polNum) / torNum
    );
}

export async function snapshotPoloidalPreview(figures) {
    const { polNum, radNum } = figures.pop();

    await drawPoloidalDataWebGL(document.querySelector('#poloidal-preview'), {
        radNum,
        polNum,
        x: figures[0].data[0].x,
        y: figures[0].data[0].y,
        z: figures[0].data[1].z,
    });
}

export async function snapshotPoloidal(figures, safetyFactor, quick, playing) {
    const MIN_PTS = 10;
    const { polNum, radNum } = figures.pop();

    const flattenedField = figures[0].data[1].z;
    const diagFluxLineColor = 'rgba(142.846, 176.35, 49.6957, 0.9)';
    const diagFlux =
        state.basicParameters.diag_flux ?? state.basicParameters.iflux;

    if (!playing) {
        drawPoloidalDataPlotly(
            figures[0],
            radNum,
            polNum,
            diagFlux,
            diagFluxLineColor
        );
    }

    if (quick) {
        return;
    }

    // calculate spectrum profile on radial grids
    const selectedPoloidalModeNum = [...new Set(state.basicParameters.mmodes)];
    const modeNum = selectedPoloidalModeNum.length;
    if (Math.floor(polNum / MIN_PTS) < Math.max(...selectedPoloidalModeNum)) {
        getStatusBar().warn = 'm modes in gtc.in is too high!';
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

    const fft = await getFFT();

    const extra_spectrum_data = Array.from(
        { length: polNum / MIN_PTS },
        (_, i) => {
            return {
                y: [],
                name: `m = ${i}`,
                showlegend: false,
                hoverinfo: 'name',
                visible: false,
                max_: -Infinity,
            };
        }
    );
    for (let r = 0; r < radNum; r++) {
        const circle = flattenedField.slice(r * polNum, (r + 1) * polNum);
        fft.r2c1d(circle).forEach((amp, i) => {
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

    const RS_POINT_NUM = 20;
    if (playing) {
        for (let i = 0; i < state.rational_surface_count + 1; i++) {
            const vl = figures[1].data[i];
            if (i == 0) {
                vl.y = limits;
                continue;
            }
            vl.y = Array.from({ length: RS_POINT_NUM }).map(
                (_, i) =>
                    limits[0] +
                    ((limits[1] - limits[0]) * i) / (RS_POINT_NUM - 1)
            );
        }
    } else {
        const rational_surface = safetyFactor
            ? getRationalSurface(
                  safetyFactor,
                  state.basicParameters.nmodes,
                  state.basicParameters.mmodes
              )
            : [];
        state.rational_surface_count = rational_surface.length;
        spectrumFigureData.unshift(
            ...rational_surface.map(({ n, m, r }) => {
                const pos = state.basicParameters.mpsi * r;
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

        spectrumFigureData.unshift({
            name: 'Diagnostic Flux',
            x: [
                state.basicParameters.diag_flux,
                state.basicParameters.diag_flux,
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
    }
    // add control buttons
    // traces: diag flux | rational surfaces | selected m modes (real, imag, modulus) | some largest m modes
    const pre_len = 1 + state.rational_surface_count;
    const step3_pick = i =>
        Array.from(
            spectrumFigureData,
            (_, ind) =>
                ind < pre_len ||
                ((ind - pre_len) % 3 == i &&
                    ind < pre_len + 3 * selectedPoloidalModeNum.length)
        );
    if (playing) {
        figures[1].data.splice(
            1 + state.rational_surface_count,
            Infinity,
            ...spectrumFigureData
        );
    } else {
        figures[1].data = spectrumFigureData;
    }
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
                                'xaxis.range': [0, state.basicParameters.mpsi],
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
                                    ind < 1 + state.rational_surface_count ||
                                    ind >=
                                        1 +
                                            state.rational_surface_count +
                                            3 * selectedPoloidalModeNum.length
                            ),
                        },
                        {
                            'xaxis.range': [0, state.basicParameters.mpsi],
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

// ==================================================================
//  Exported: pre-processing
// ==================================================================

/**
 * Pre-process snapshot figures before rendering.
 *
 * @param {HTMLElement} btn - The snapshot sub-plot button element.
 * @param {Array<Object>} figures - Array of Plotly figure descriptors.
 */
export async function snapshotPreprocess(btn, figures) {
    if (btn.id.endsWith('spectrum')) {
        await snapshotSpectrum(figures);
    } else if (btn.id.endsWith('poloidal')) {
        const quick = btn.id.endsWith('quick_poloidal');
        const playing = state.snapshot_playing;
        // quick: do not fft; playing: data scheme is different
        let safety_factor = null;
        if (playing) {
            const fig_1 = document.getElementById('figure-1');
            const fig_2 = document.getElementById('figure-2');
            const [z] = figures.splice(
                0,
                1,
                {
                    data: fig_1.data,
                    layout: fig_1.layout,
                },
                {
                    data: fig_2.data,
                    layout: fig_2.layout,
                }
            );
            figures[0].data[1].z = z;
        } else {
            const res = await requestPlotData('plotType/Equilibrium', {
                optional: true,
            });
            safety_factor = res.ok
                ? (
                      await (
                          await requestPlotData('data/Equilibrium-1D-rg_n-q', {
                              optional: true,
                          })
                      )?.json()
                  )

                      ?.at(0)
                      ?.data?.at(0)
                : null;
        }
        await snapshotPoloidal(figures, safety_factor, quick, playing);
    }
    state.current_snapshot_figure = btn;
}

// ==================================================================
//  Exported: player
// ==================================================================

/**
 * Append snapshot player controls to a snapshot panel.
 *
 * @param {HTMLElement} panel - The snapshot sub-panel container.
 * @param {Function} createGroup - Creates a group of buttons and returns
 *   the container element.
 * @param {Function} openPanel - The tab-panel opener (bound to a button).
 * @param {Function} getData - The plot-data fetcher (bound to a button).
 */
export function addSnapshotPlayer(panel, createGroup, openPanel, getData) {
    panel.appendChild(
        createGroup(
            [
                'previous snapshot',
                'next snapshot',
                'previous (continuously)',
                'next (continuously)',
            ],
            async function () {
                let cont = this.innerText.endsWith('(continuously)');
                const prev = this.innerText.startsWith('prev');
                const stopper = ev => {
                    if (ev.key === 's') {
                        cont = false;
                    }
                };
                state.snapshot_playing = true;
                window.addEventListener('keypress', stopper);

                const delay = 300; // shortest possible frame interval
                // real frame interval might be larger due to network
                // and/or render
                let last_time = document.timeline.currentTime - delay;

                const animate = async timestamp => {
                    if (timestamp - last_time < delay) {
                        requestAnimationFrame(animate);
                        return;
                    }
                    const current_snapshot = state.current_snapshot;
                    if (prev) {
                        if (current_snapshot.previousElementSibling) {
                            state.current_snapshot =
                                current_snapshot.previousElementSibling;
                        } else {
                            if (!cont) {
                                alert('No previous snapshot');
                            }
                            cont = false;
                        }
                    } else {
                        if (current_snapshot.nextElementSibling) {
                            state.current_snapshot =
                                current_snapshot.nextElementSibling;
                        } else {
                            if (!cont) {
                                alert('No next snapshot');
                            }
                            cont = false;
                        }
                    }
                    await openPanel.call(state.current_snapshot, false);
                    if (state.current_snapshot_figure) {
                        await getData.call(
                            state.current_snapshot_figure,
                            false
                        );
                    }
                    current_snapshot.classList.remove('snapshot-selected');
                    state.current_snapshot.classList.add('snapshot-selected');

                    last_time = timestamp;
                    if (cont) {
                        requestAnimationFrame(animate);
                    } else {
                        // cleanup
                        window.removeEventListener('keypress', stopper);
                        state.snapshot_playing = false;
                    }
                };
                requestAnimationFrame(animate);
            }
        )
    );
}
