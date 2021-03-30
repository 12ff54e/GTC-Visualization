window.addEventListener('load', (ev) => {
    const form = document.getElementById('input');
    const input_area = form.firstElementChild;

    const input_spec = fetch('/javascripts/input-parameters.json').then(
        (res) => {
            if (res.ok) {
                return res.json();
            } else {
                throw new Error('No input parameters descriptor file found.');
            }
        }
    );
    // I have to do this, since the float window button is added during input form generation
    const import_script = import('./floating-window.js');

    Promise.all([input_spec, import_script])
        .then(([input_parameters, add_float_window]) => {
            const cat = new Map();
            for (const parameter_spec of input_parameters) {
                let cat_div = cat.get(parameter_spec.group);
                if (!cat_div) {
                    cat_div = document.createElement('div');
                    input_area.append(cat_div);
                    cat.set(parameter_spec.group, cat_div);

                    // Add sub title
                    const sub_title = document.createElement('h2');
                    sub_title.innerText = parameter_spec.group;
                    cat_div.append(sub_title);
                }
                cat_div.classList.add('category');
                const input_div = document.createElement('div');
                input_div.classList.add('input_wrapper');

                if (parameter_spec.possible_value) {
                    // Add select element
                    const select = document.createElement('select');
                    select.name =
                        (parameter_spec.group == 'equilibrium' ? 'eq-' : '') +
                        parameter_spec.name;
                    select.id = parameter_spec.name;
                    for (const v of parameter_spec.possible_value) {
                        const opt = document.createElement('option');
                        opt.value = v;
                        opt.text = v;
                        select.appendChild(opt);
                    }
                    input_div.append(select);
                } else {
                    // Add input element
                    const input = document.createElement('input');
                    input.name =
                        (parameter_spec.group == 'equilibrium' ? 'eq-' : '') +
                        parameter_spec.name;
                    input.id = parameter_spec.name;
                    input.value =
                        parameter_spec.type == 'array'
                            ? parameter_spec.default.replace(/\s/g, ', ')
                            : parameter_spec.default;
                    input.type =
                        parameter_spec.type == 'integer' ? 'number' : 'text';

                    // This pattern matches number w/wo decimal point, or engineering form
                    const number_pattern =
                        '-?((\\d*\\.\\d+)|(\\d+\\.\\d*)|(\\d+))(e-?\\d+)?';
                    if (parameter_spec.type == 'real') {
                        // single number
                        input.pattern = `^${number_pattern}\$`;
                    } else if ((parameter_spec.type = 'array')) {
                        // comma (maybe with space) separated number list
                        input.pattern = `^${number_pattern}(,\\s*${number_pattern})*\$`;
                    }

                    input_div.append(input);
                }

                // Add variable name
                const label = document.createElement('label');
                label.setAttribute('for', parameter_spec.name);
                label.innerText = parameter_spec.name + '=';

                input_div.prepend(label);

                // Add Slider
                if (
                    parameter_spec.group == 'equilibrium' &&
                    parameter_spec.description.includes('hyperbolic')
                ) {
                    const slider_div = document.createElement('div');
                    // input_div.append(slider_div);

                    const slider0 = document.createElement('input');
                    slider0.type = 'range';
                    slider0.min = '0';
                    slider0.max = '0.5';
                    slider0.step = 'any';

                    const slider1 = slider0.cloneNode();
                    slider1.max = '1';
                    const slider2 = slider1.cloneNode();
                    slider2.min = '0.05';
                    slider_div.append(slider0, slider1, slider2);
                }

                // Add description texts
                const description = document.createElement('span');
                input_div.append(description);

                description.innerText = parameter_spec.description;
                if (
                    parameter_spec.group == 'equilibrium' &&
                    parameter_spec.description.includes('hyperbolic')
                ) {
                    description.innerText += '. Corresponding gradient R0/L = ';
                    const span = document.createElement('span');
                    span.classList.add('bold');
                    description.append(span, ' @psi/psiw = ', span.cloneNode());
                }
                if (
                    parameter_spec.group == 'equilibrium' &&
                    parameter_spec.type == 'array'
                ) {
                    // Add figure plot button
                    const figure_button = document.createElement('button');
                    input_div.append(figure_button);
                    figure_button.innerText = 'Plot figure';
                    figure_button.classList.add('float_window_trigger');
                }

                cat_div.append(input_div);
            }

            // Create eq object
            const R0_input = document.querySelector('#r0,#R0');
            const B0_input = document.querySelector('#b0,#B0');
            const psi_w_input = document.querySelector('#psiw_analytic');
            const q_input = document.querySelector('#q_analytic');
            const eq = new Equilibrium({
                R0: parseFloat(R0_input.value) / 100,
                B0: parseFloat(B0_input.value) / 10000,
                psi_w: parseFloat(psi_w_input.value),
                q_c: q_input.value.split(',').map((c) => parseFloat(c)),
            });

            // mhd profile coefficients inputs, including temperature and density of ion and electron
            const mhd_profiles_inputs = Array.from(
                document.getElementsByTagName('input')
            ).filter(
                (input) =>
                    input.name.startsWith('eq-') &&
                    input.nextElementSibling.innerText.includes('hyperbolic')
            );

            // inputs determine ref flux surface position
            const ref_flux_surface_inputs = {
                psi0: document.querySelector('#psi0'),
                psi1: document.querySelector('#psi1'),
                m_psi: document.querySelector('#mpsi'),
                ref_flux_index: document.querySelector('#iflux'),
            };

            function input_validator(input) {
                return new RegExp(input.pattern).test(input.value);
            }

            function ref_flux_r() {
                const {
                    psi0,
                    psi1,
                    m_psi,
                    ref_flux_index,
                } = ref_flux_surface_inputs;
                const valid = input_validator(psi0) && input_validator(psi1);
                if (!valid) {
                    return;
                }

                const psi0_val = parseFloat(psi0.value);
                const psi1_val = parseFloat(psi1.value);
                const m = parseInt(m_psi.value);
                const i = parseInt(ref_flux_index.value);

                return (
                    eq.r_norm(psi0_val) * (1 - i / m) +
                    (eq.r_norm(psi1_val) * i) / m
                );
            }

            // Add callback for updating scale length
            const update_scale_length = function () {
                // Validate input
                if (!input_validator(this)) {
                    return;
                }
                const gradient_span = this.nextElementSibling.firstElementChild;
                const position_span = this.nextElementSibling.lastElementChild;
                const psi_ref = eq.psi_r(ref_flux_r());
                gradient_span.innerText = eq
                    .inverse_scale_length_hyperbolic(
                        ...this.value.split(',').map((n) => parseFloat(n)),
                        psi_ref
                    )
                    .toFixed(2);
                position_span.innerText = psi_ref.toFixed(2);
            };
            mhd_profiles_inputs.forEach((input) => {
                update_scale_length.call(input);
                input.addEventListener('change', update_scale_length);
            });
            // Once ref surface position changes, update scale length
            Object.values(ref_flux_surface_inputs).forEach((input) => {
                input.addEventListener('change', () => {
                    mhd_profiles_inputs.forEach((input) =>
                        update_scale_length.call(input)
                    );
                });
            });

            // Add callback for updating eq object
            function add_eq_update_callback(
                input_element,
                var_name,
                preprocess = parseFloat
            ) {
                input_element.addEventListener('change', function () {
                    // Validate input
                    if (!input_validator(this)) {
                        return;
                    }
                    eq.update({ [var_name]: preprocess(this.value) });
                    // Notice that once eq has changed, scale lengths need to be re-calculated
                    mhd_profiles_inputs.forEach((input) =>
                        update_scale_length.call(input)
                    );
                });
            }
            add_eq_update_callback(
                R0_input,
                'R0',
                (r0) => parseFloat(r0) / 100
            );
            add_eq_update_callback(
                B0_input,
                'B0',
                (b0) => parseFloat(b0) / 10000
            );
            add_eq_update_callback(psi_w_input, 'psi_w');
            add_eq_update_callback(q_input, 'q_c', (q_coef) =>
                q_coef.split(',').map((c) => parseFloat(c))
            );

            // define plot function
            function plot(div) {
                // this refers to button here, use it to retrieve coefficient
                const input_div = this.parentElement;
                const input = input_div.querySelector('input');
                if (!input_validator(input)) {
                    return; // TODO: Warn the user!
                }
                const coef = input.value.split(',').map((c) => parseFloat(c));

                const len = 100;
                const psi_line = Array(len + 1)
                    .fill(0)
                    .map((_, i) => i / len);

                // determines function to plot according to description
                const is_mhd_profile = input_div
                    .querySelector('span')
                    .innerText.includes('hyperbolic');
                const func = is_mhd_profile
                    ? (psi) =>
                          eq.hyperbolic_profile(...coef, psi) /
                          eq.hyperbolic_profile(...coef, 0)
                    : (psi) => coef[0] + (coef[1] + coef[2] * psi) * psi;

                const data = [
                    {
                        x: psi_line,
                        y: psi_line.map((psi) => func(psi)),
                        mode: 'lines',
                        name: 'profile',
                    },
                ];
                if (is_mhd_profile) {
                    data.push({
                        x: psi_line,
                        y: psi_line.map((psi) =>
                            eq.inverse_scale_length_hyperbolic(...coef, psi)
                        ),
                        xaxis: 'x2',
                        yaxis: 'y2',
                        mode: 'lines',
                        name: 'gradient',
                    });
                    const ref = eq.psi_r(ref_flux_r());
                    data.push(
                        { x: [ref], y: [0], name: 'ref' },
                        {
                            x: [ref],
                            y: [0],
                            xaxis: 'x2',
                            yaxis: 'y2',
                            name: 'ref',
                        }
                    );
                }

                const plot_name = input_div
                    .querySelector('label')
                    .innerText.split('_')[0];
                const layout = {
                    title: plot_name,
                    xaxis: {
                        hoverformat: '.4g',
                    },
                    yaxis: {
                        hoverformat: '.4g',
                    },
                };
                if (is_mhd_profile) {
                    const type = plot_name.substring(0, 1);
                    const particle = plot_name.substring(1);
                    layout.xaxis2 = {
                        hoverformat: '.4g',
                        title: '$\\psi/\\psi_w$',
                    };
                    layout.yaxis.title = `$${type}_{${particle}}$`;
                    layout.yaxis2 = {
                        hoverformat: '.4g',
                        title: `$\\frac{\\mathrm{d}\\ln ${type}_{${particle}}}{\\mathrm{d}r}$`,
                    };
                    layout.grid = {
                        rows: 1,
                        columns: 2,
                        pattern: 'independent',
                    };
                } else {
                    layout.xaxis.title = '$\\psi/\\psi_w$';
                }

                Plotly.newPlot(div, data, layout);
            }

            // // register float window button callback
            // add_float_window.default(plot);

            // show figure above its input
            document
                .querySelectorAll('.float_window_trigger')
                .forEach((btn) => {
                    btn.addEventListener('click', function (event) {
                        event.preventDefault();

                        const input_div = this.parentElement;
                        let figure = input_div.previousElementSibling.querySelector(
                            '#figure_div'
                        );
                        if (!figure) {
                            const figure_container = document.createElement(
                                'div'
                            );
                            figure_container.classList.add('figure_container');
                            figure = document.createElement('div');
                            figure.id = 'figure_div';
                            input_div
                                .insertAdjacentElement(
                                    'beforeBegin',
                                    figure_container
                                )
                                .append(figure);
                        }

                        plot.call(this, figure);
                    });
                });
        })
        .catch((err) => console.log(err));
});

class Equilibrium {
    constructor({ R0, B0, psi_w, q_c }) {
        this.R0 = R0;
        this.B0 = B0;
        this.psi_w = psi_w;
        this.q_c = [...q_c];
    }

    update({ R0 = this.R0, B0 = this.B0, psi_w = this.psi_w, q_c = this.q_c }) {
        this.R0 = R0;
        this.B0 = B0;
        this.psi_w = psi_w;
        this.q_c = [...q_c];

        // debug
        console.log('Equilibrium updated');
        console.log(
            `  R0=${this.R0}m, B0=${this.B0}T, psi_w=${this.psi_w}, q_c=${this.q_c}`
        );
    }

    q(psi) {
        const [q0, q1, q2] = this.q_c;
        return q0 + (q1 + q2 * psi) * psi;
    }

    r_norm(psi) {
        const [q0, q1, q2] = this.q_c;
        return Math.sqrt(
            ((q0 + (q1 / 2 + (q2 / 3) * psi) * psi) * psi) /
                (q0 + q1 / 2 + q2 / 3)
        );
    }

    hyperbolic_profile(n0, n1, n2, psi) {
        return 1 + n0 * (Math.tanh((n1 - psi) / n2) - 1);
    }

    /**
     * Calculate the scale length of profile n0*(Tanh(n1-psi/n2)-1)
     *
     * @param {number} n0
     * @param {number} n1
     * @param {number} n2
     * @param {number} psi
     * @returns scale_length
     */
    inverse_scale_length_hyperbolic(n0, n1, n2, psi) {
        const sech = (x) => 2 / (Math.exp(x) + Math.exp(-x));
        const df_dp = (psi) =>
            (n0 * Math.pow(sech((n1 - psi) / n2), 2)) /
            (n2 * this.hyperbolic_profile(n0, n1, n2, psi));

        return (
            (this.r_norm(psi) * df_dp(psi) * this.R0) /
            (Math.sqrt(this.psi_w / (2 * this.B0)) * this.q(psi))
        );
    }

    // /**
    //  * Calculate the maximum inverse scale length of profile n0*(Tanh(n1-psi/n2)-1)
    //  *
    //  * @param {number} n0
    //  * @param {number} n1
    //  * @param {number} n2
    //  * @returns scale_length
    //  */
    // inverse_scale_length_hyperbolic_maximum(n0, n1, n2) {
    //     const psi = n1;
    //     return this.inverse_scale_length_hyperbolic(
    //         n0,
    //         n1,
    //         n2,
    //         psi < 0 ? 0 : psi > 1 ? 1 : psi
    //     );
    // }

    psi_r(r) {
        return bisection((psi) => this.r_norm(psi) - r, 0, 1);
    }
}

/**
 * Find root of func between left of right within error eps
 *
 * @param {function} func
 * @param {number} left
 * @param {number} right
 * @param {number} eps
 * @param {number} cap
 * @returns solution
 */
function bisection(func, left, right, eps, cap = 20) {
    eps = eps ?? 0.0001 * (right - left);
    let mid = (left + right) / 2;

    while (Math.abs(func(mid)) > eps && cap-- > 0) {
        if (func(left) * func(mid) > 0) {
            left = mid;
            mid = (mid + right) / 2;
        } else {
            right = mid;
            mid = (left + mid) / 2;
        }
    }

    return mid;
}
