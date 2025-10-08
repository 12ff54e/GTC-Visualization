'use strict';

export async function historyMode(gtc_instance, figures) {
    const len = figures[0].data[0].x.at(-1);

    const default_range = [0.43, 0.98];
    const growth_rate_measure_interval =
        gtc_instance.hist_range.growth_rate?.map(i => i / len) ?? default_range;
    const freq_measure_interval =
        gtc_instance.hist_range.frequency?.map(i => i / len) ?? default_range;
    // deconstructing figures
    let [componentsFig, growthFig, freqFig, spectralFig] = figures;

    // growth rate figure
    let { gamma, measurePts } = cal_gamma(
        growthFig.data[0].y,
        gtc_instance.time_step,
        growth_rate_measure_interval
    );
    growthFig.data[1] = {
        x: [measurePts[0].x, measurePts[1].x],
        y: [measurePts[0].y, measurePts[1].y],
        type: 'scatter',
        line: { dash: 'dot', color: 'rgb(245, 10, 10)', width: 3 },
        markers: { color: 'rgb(255, 0, 0)', size: 8 },
    };
    growthFig.layout.title.text = `$\\gamma=${gamma.toPrecision(5)}$`;
    growthFig.layout.xaxis.rangeslider = {
        bgcolor: 'rgb(200,200,210)',
    };

    // frequency figure
    let y0 = componentsFig.data[0].y[0];
    y0 = y0 == 0 ? 1 : y0;
    let yReals = componentsFig.data[0].y.map(
        (y, i) => y / (Math.exp(gamma * (i + 1) * gtc_instance.time_step) * y0)
    );
    let yImages = componentsFig.data[1].y.map(
        (y, i) => y / (Math.exp(gamma * (i + 1) * gtc_instance.time_step) * y0)
    );
    let omega;
    ({ omega, measurePts } = cal_omega_r(
        yReals,
        yImages,
        gtc_instance.time_step,
        freq_measure_interval
    ));
    freqFig.data[0] = {
        x: [...Array(yReals.length).keys()].map(
            i => (i + 1) * gtc_instance.time_step
        ),
        y: yReals,
        type: 'scatter',
        mode: 'lines',
    };
    freqFig.data[1] = {
        x: [...Array(yReals.length).keys()].map(
            i => (i + 1) * gtc_instance.time_step
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
    freqFig.layout.title.text = `$\\omega=${omega.toPrecision(5)}$`;
    freqFig.layout.xaxis.rangeslider = {
        bgcolor: 'rgb(200,200,210)',
    };

    // spectral figure
    let powerSpectrum = cal_spectrum(
        yReals,
        yImages,
        gtc_instance.time_step,
        freq_measure_interval
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

    const mmodes = Math.floor(polNum / 5);
    const nmodes = Math.floor(torNum / 5);

    const modulo = (re, im) => Math.sqrt(re * re + im * im);

    const poloidalSpectrum = Array(mmodes).fill(0);
    const planPol = new fftw['r2c']['fft1d'](polNum);
    for (let section of field) {
        const powerSpectrum = planPol.forward(section);
        poloidalSpectrum[0] += powerSpectrum[0];
        for (let i = 1; i < mmodes; i++) {
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

    const toroidalSpectrum = Array(nmodes).fill(0);
    const planTor = new fftw['r2c']['fft1d'](torNum);
    for (let section of transpose(field)) {
        const powerSpectrum = planTor.forward(section);
        toroidalSpectrum[0] += powerSpectrum[0];
        for (let i = 1; i < nmodes; i++) {
            toroidalSpectrum[i] +=
                2 * modulo(powerSpectrum[2 * i], powerSpectrum[2 * i + 1]);
        }
    }
    planTor.dispose();

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

export async function snapshotPoloidal(
    gtc_instance,
    figures,
    statusBar,
    safetyFactor
) {
    const MIN_PTS = 10;
    const { polNum, radNum } = figures.pop();

    const flattenedField = figures[0].data[1].z;
    const diagFluxLineColor = 'rgba(142.846, 176.35, 49.6957, 0.9)';
    const diagFlux =
        gtc_instance.basicParameters.diag_flux ??
        gtc_instance.basicParameters.iflux;

    drawPoloidalDataPlotly(
        figures[0],
        radNum,
        polNum,
        diagFlux,
        diagFluxLineColor
    );

    // calculate spectrum profile on radial grids

    const selectedPoloidalModeNum = [
        ...new Set(gtc_instance.basicParameters.mmodes),
    ];
    const modeNum = selectedPoloidalModeNum.length;
    if (Math.floor(polNum / MIN_PTS) < Math.max(...selectedPoloidalModeNum)) {
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

    if (!gtc_instance.fftPlan) {
        const planConstructor = fftw['r2c']['fft1d'];
        gtc_instance.fftPlan = new planConstructor(polNum);
    }
    const plan = gtc_instance.fftPlan;

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

    const rational_surface = safetyFactor
        ? getRationalSurface(
              safetyFactor,
              gtc_instance.basicParameters.nmodes,
              gtc_instance.basicParameters.mmodes,
              gtc_instance.basicParameters.radial_region
          )
        : [];
    const RS_POINT_NUM = 20;
    spectrumFigureData.unshift(
        ...rational_surface.map(({ n, m, r }) => {
            const pos = gtc_instance.basicParameters.mpsi * r;
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
            gtc_instance.basicParameters.diag_flux,
            gtc_instance.basicParameters.diag_flux,
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
    const pre_len = 1 + rational_surface.length;
    const step3_pick = i =>
        Array.from(
            spectrumFigureData,
            (_, ind) =>
                ind < pre_len ||
                ((ind - pre_len) % 3 == i &&
                    ind < pre_len + 3 * selectedPoloidalModeNum.length)
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
                                    gtc_instance.basicParameters.mpsi,
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
                                gtc_instance.basicParameters.mpsi,
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

function drawPoloidalDataPlotly(
    figure,
    rad_num,
    pol_num,
    diag_flux,
    diag_line_color
) {
    // add carpet indices

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

    // draw diagnostic flux indicator

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

/**
 * @param {HTMLDivElement} container
 * @param {{radNum: number, polNum:number, x:[number], y:[number], z:[number]}} data
 */
async function drawPoloidalDataWebGL(container, data) {
    // create canvas

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

    // webgl2 context
    const gl = figure_canvas.getContext('webgl2', { alpha: true });
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

    // Sampling from ColorData["ThermometerColors"]
    // const color_map_data = new Uint8Array([
    //     41, 30, 202, 87, 113, 234, 151, 191, 241, 203, 226, 225, 229, 217, 188,
    //     224, 168, 137, 191, 91, 86, 136, 21, 42,
    // ]);
    // Blend between blue and red (not pure blue and red though, they are actually cf[0] and cf[1], with
    //  cf = ColorData["TemperatureMap"])
    const color_map_data = new Uint8Array([
        45, 77, 238, 97, 122, 242, 150, 166, 246, 202, 210, 250, 255, 255, 255,
        243, 199, 201, 231, 144, 148, 220, 89, 95, 208, 34, 41,
    ]);
    const legend_width = 0.1 * (x_max - x_min);
    const legend_left_padding = 0.1 * (x_max - x_min);

    // bounding box should be aware of color map

    const x_max_total = x_max + legend_left_padding + legend_width;
    const bounding_box = {
        center: [0.5 * (x_min + x_max_total), 0.5 * (y_min + y_max)],
        // add padding through slightly stretch the bounding box dimension
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

    // create shader program
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
    gl.clearColor(0, 0, 0, 0);
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

export function addSimulationRegion(gtc_instance, fig) {
    const [rg0, rg1] = gtc_instance.basicParameters.radial_region;
    const rgd =
        rg0 +
        (gtc_instance.basicParameters.diag_flux /
            gtc_instance.basicParameters.mpsi) *
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
export function cal_gamma(ys, dt, interval) {
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
export function cal_omega_r(yReals, yImages, dt, interval) {
    let [tIni, tEnd] = interval;

    let tIniIndex = Math.floor(tIni * yReals.length);
    let tEndIndex = Math.floor(tEnd * yReals.length);

    const findMaximuns = ys => {
        const maximums = [];
        const section = [];
        for (
            let i = Math.max(tIniIndex, 1);
            i < Math.min(tEndIndex, yReals.length - 1);
            ++i
        ) {
            section.push((ys[i - 1] + ys[i] + ys[i + 1]) / 3);
        }
        section.forEach((y, i, arr) => {
            if (
                i > 0 &&
                i < arr.length - 1 &&
                y > arr[i - 1] &&
                y > arr[i + 1]
            ) {
                maximums.push([i + tIniIndex, y]);
            }
        });
        return maximums;
    };

    const realMaximums = findMaximuns(yReals);
    const imagMaximums = findMaximuns(yImages);

    const maximums =
        realMaximums.length > imagMaximums.length ? realMaximums : imagMaximums;

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
export function cal_spectrum(reals, images, timeStep, interval) {
    const [t_ini, t_end] = interval.map(t => Math.floor(t * reals.length));
    const len = t_end - t_ini;
    const halfLen = Math.floor(len / 2);

    const plan = new fftw['c2c']['fft1d'](len);

    const spectrum = unInterleave(
        plan.forward(
            interleave(reals.slice(t_ini, t_end), images.slice(t_ini, t_end))
        )
    ).map(([re, im]) => Math.sqrt(re * re + im * im));

    plan.dispose();

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

function getRationalSurface(safetyFactor, n_modes, m_modes, radial_region) {
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
    const [r0, r1] = radial_region;
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
