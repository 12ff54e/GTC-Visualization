export async function generateSummary(status_bar) {
    const container = document.querySelector('#container');
    container.style.display = 'initial';
    const summary = container.firstElementChild;
    if (summary.childElementCount != 0) {
        return;
    }

    const res = await fetch(
        `plot/Summary?dir=${document.querySelector('#outputTag').innerText}`
    );
    if (!res.ok) {
        throw `ERROR, CODE: ${res.status}`;
    }

    const data = await res.json();
    const minorRadius = data.rg.at(-1);

    const addParagraph = str => {
        const p = document.createElement('p');
        summary.appendChild(p).innerHTML = str;
        return p;
    };

    const bp = GTCGlobal.basicParameters;
    const basicInfo = `This is a ${bp.nonlinear ? 'non' : ''}linear electro${
        bp.magnetic ? 'magnetic' : 'static'
    } run. The equilibrium is ${
        bp.numereq ? 'numeric' : 'analytic'
    } with a major radius of \\(${(bp.r0 / 100).toPrecision(
        4
    )}\\text{m}\\), minor radius of \\(${(
        (minorRadius * bp.r0) /
        100
    ).toPrecision(4)}\\text{m}\\)(\\(\\epsilon=${minorRadius.toPrecision(
        4
    )}\\)) and axis magnetic field strength of \\(${(bp.b0 / 10000).toPrecision(
        4
    )}\\text{T}\\).`;
    addParagraph(basicInfo);

    const rgDiag =
        lerp(...bp.radial_region, bp.diag_flux / bp.mpsi) * minorRadius;
    const eqRadialDiagIndex = lower_bound(data.rg, rgDiag) - 1;
    const value_diag_flux = profile_name =>
        linearMap(
            rgDiag,
            data.rg[eqRadialDiagIndex],
            data.rg[eqRadialDiagIndex + 1],
            data[profile_name][eqRadialDiagIndex],
            data[profile_name][eqRadialDiagIndex + 1]
        );
    const inverse_scale_length_diag_flux = profile_name =>
        interpolationDerivativeAt(rgDiag, data['rg'], data[profile_name]) /
        value_diag_flux(profile_name);

    const safety_factor = value_diag_flux('q');
    const properModeIndex = bp.nmodes.reduce(
        (acc, val, idx) => {
            const { eps } = acc;
            const delta = Math.abs(bp.mmodes[idx] / val - safety_factor);
            return eps > delta ? { eps: delta, minIdx: idx } : acc;
        },
        { minIdx: 0, eps: Infinity }
    ).minIdx;
    const diagFluxProp = `The diagnostic flux you choose locates at \\(${(
        rgDiag / minorRadius
    ).toPrecision(
        4
    )}a_0\\). Here safety factor \\(q=${safety_factor.toPrecision(
        4
    )}\\), shear \\(\\hat{s}=r\\mathrm{d\\,ln}q/\\mathrm{d}r=${(
        inverse_scale_length_diag_flux('q') * rgDiag
    ).toFixed(
        4
    )}\\) (<button id="summary-safety-factor" class="summary-figure-button">show/hide figure</button>). Among 8 modes you choose, the ${
        properModeIndex + 1
    }${
        properModeIndex == 0 ? 'st' : properModeIndex == 1 ? 'nd' : 'th'
    } one (\\(m/n=${bp.mmodes[properModeIndex]}/${
        bp.nmodes[properModeIndex]
    }\\)) matches safety factor at diagnostic surface best. So you might expect the growth rate of it being largest among others when checking <button id="summary-History-phi-mode${
        properModeIndex + 1
    }" class="summary-jump-button">History > phi-mode${
        properModeIndex + 1
    }</button>.`;
    addParagraph(diagFluxProp);

    const normalizedMinorRadius = {
        tag: '$r$',
        data: data.rg.map(r => r / minorRadius),
    };
    multipleTraceFigure(
        summary,
        summary.querySelector('#summary-safety-factor'),
        normalizedMinorRadius,
        [
            {
                title: 'Safety Factor',
                tag: '$q$',
                data: data.q,
            },
            {
                title: 'Shear',
                tag: '$\\hat{s}$',
                data: zip(
                    (dq, r, q) => (dq * r * r) / q,
                    data['dlnq_dpsi'],
                    data.rg,
                    data.q
                ),
            },
        ]
    );

    const rho_diag_flux =
        bp['rho0'] *
        (bp['inorm'] ? 1 : Math.sqrt(value_diag_flux('Te') / data['Te'][0]));
    const electron_beta_diag_flux =
        bp['betae'] *
        (bp['inorm']
            ? 1
            : ((value_diag_flux('Te') / data['Te'][0]) *
                  value_diag_flux('ne')) /
              data['ne'][0]);
    const energetic_ion_beta_diag_flux =
        value_diag_flux('Tf') * value_diag_flux('nf') * bp['betae'];
    const key_dimensionless_parameters = `At diagnostic flux, density gradient \\(\\epsilon_n=${(
        -1 / inverse_scale_length_diag_flux('ne')
    ).toFixed(4)},\\) \\(\\eta_\\mathrm{i}=${(
        inverse_scale_length_diag_flux('Ti') /
        inverse_scale_length_diag_flux('ni')
    ).toFixed(4)},\\) ${
        bp.magnetic
            ? `\\(\\eta_\\mathrm{e}=${(
                  inverse_scale_length_diag_flux('Te') /
                  inverse_scale_length_diag_flux('ne')
              ).toFixed(
                  4
              )},\\) electron beta \\(\\beta_\\mathrm{e}=${electron_beta_diag_flux.toFixed(
                  4
              )},\\) ${
                  bp.fload > 0
                      ? `energetic ion beta \\(\\beta_\\mathrm{f}=${energetic_ion_beta_diag_flux.toFixed(
                            4
                        )},\\) `
                      : ''
              }`
            : ''
    }temperature ratio \\(\\tau=${(
        value_diag_flux('Te') / value_diag_flux('Ti')
    ).toFixed(4)},\\) \\(b_\\theta=\\)${[...new Set(bp['mmodes'])]
        .map(
            m =>
                `\\(${(
                    Math.pow((m / rgDiag) * rho_diag_flux, 2) * bp['aion']
                ).toFixed(4)}(${m}),\\)`
        )
        .join(' ')} for modes in gtc.in respectively.`;
    addParagraph(key_dimensionless_parameters);

    // check rg monotonicity
    if (data.rg.every((v, i, a) => !i || a[i - 1] <= v)) {
        status_bar.warn = 'rg is not monotonic';
    }

    const particleLoading = (varName, pload) =>
        pload == 1
            ? 'uniform in both temperature and density'
            : pload == 2
            ? 'of varying temperature and uniform density'
            : pload == 3
            ? 'follow real temperature and density profile.'
            : `of ${varName} = ${pload} (interpretation of this parameter depends on version of GTC)`;
    const particleProp = `The ions, when loaded into this simulation, are ${particleLoading(
        'iload',
        bp.iload
    )}. Electrons are modeled ${
        bp.nhybrid == 0
            ? 'adiabatic'
            : `fluid-kinetic (cf. Lin 2001), and are ${particleLoading(
                  'eload',
                  bp.eload
              )}`
    }.${
        bp.fload > 0
            ? ` There are also energetic particles, ${particleLoading(
                  'fload',
                  bp.fload
              )}`
            : ''
    }`;
    addParagraph(particleProp);
    // summary.appendChild(document.createElement('ul'))

    const driveDetails = ` Density and temperature gradients are shown as follows (<button id="summary-gradients" class="summary-figure-button">show/hide figure</button>)`;
    addParagraph(driveDetails);

    const calc_gradient = profile_name =>
        zip(
            (d, f) => -d / f,
            derivative(data['rg'], data[profile_name]),
            data[profile_name]
        );
    multipleTraceFigure(
        summary,
        summary.querySelector('#summary-gradients'),
        normalizedMinorRadius,
        [
            {
                title: 'Electron Temperature',
                tag: '$T_\\text{e}$',
                buttonText: '\\(T_\\text{e}\\)',
                data: data['Te'],
            },
            {
                title: 'Electron Temperature Gradient',
                tag: '$\\frac{R_0}{L_\\text{T}}$',
                buttonText: '\\(R_0/L_\\text{T}\\)<code>(e)</code>',
                data: calc_gradient('Te'),
            },
            {
                title: 'Electron Density',
                tag: '$n_\\text{e}$',
                buttonText: '\\(n_\\text{e}\\)',
                data: data['ne'],
            },

            {
                title: 'Electron Density Gradient',
                tag: '$\\frac{R_0}{L_\\text{n}}$',
                buttonText: '\\(R_0/L_\\text{n}\\)<code>(e)</code>',
                data: calc_gradient('ne'),
            },
            {
                title: 'Ion Temperature',
                tag: '$T_\\text{i}$',
                buttonText: '\\(T_\\text{i}\\)',
                data: data['Ti'],
            },
            {
                title: 'Ion Temperature Gradient',
                tag: '$\\frac{R_0}{L_\\text{T}}$',
                buttonText: '\\(R_0/L_\\text{T}\\)<code>(i)</code>',
                data: calc_gradient('Ti'),
            },
            {
                title: 'Ion Density',
                tag: '$n_\\text{i}$',
                buttonText: '\\(n_\\text{i}\\)',
                data: data['ni'],
            },
            {
                title: 'Ion Density Gradient',
                tag: '$\\frac{R_0}{L_\\text{n}}$',
                buttonText: '\\(R_0/L_\\text{n}\\)<code>(i)</code>',
                data: calc_gradient('ni'),
            },
            {
                title: 'Ion Eta',
                tag: '$\\eta_i$',
                buttonText: '\\(\\eta_\\text{i}\\)',
                data: zip(
                    (a, b) => a / b,
                    calc_gradient('Ti'),
                    calc_gradient('ni')
                ),
            },
            {
                title: 'Electron Eta',
                tag: '$\\eta_e$',
                buttonText: '\\(\\eta_\\text{e}\\)',
                data: zip(
                    (a, b) => a / b,
                    calc_gradient('Te'),
                    calc_gradient('ne')
                ),
            },
        ]
    );

    const ptPerPeriod = bp.mthetamax / Math.max(...bp.mmodes);
    const gridFormation = `In the simulation setup, a \\(${bp.mgrid}\\times${
        bp.mtoroidal
    }\\) mesh grid is used. On each poloidal plane, the unstructured grid has ${
        bp.mpsi + 1
    } circles with grid point number ranging from ${bp.mtheta0} to ${
        bp.mtheta1
    }. (<span class="${
        ptPerPeriod < 15 ? 'error' : ptPerPeriod > 20 ? 'good' : 'warn'
    }">Note: Number of points per poloidal period for the maximum mode number you choose in mid-plane is about ${ptPerPeriod.toPrecision(
        2
    )}.</span>) At diagnostic surface \\(\\Delta r/\\rho_\\text{i}=${bp.delr.toPrecision(
        4
    )}\\), \\(\\Delta\\theta*r/\\rho_\\text{i}=${bp.delt.toPrecision(4)}\\).`;
    addParagraph(gridFormation);

    // renders math expression
    // MathJax.Hub.Typeset(summary);
    MathJax.typeset();

    return container;
}

async function transitionTo(root, data, label, title) {
    const transitionTrace = {
        transition: {
            duration: 250,
            easing: 'cubic-in',
        },
        frame: {
            duration: 250,
        },
    };
    const transitionLayout = {
        transition: {
            duration: 250,
            easing: 'cubic-out',
        },
        frame: {
            duration: 250,
        },
    };
    const dataRange = minmax(data, 0.2);
    await Plotly.animate(
        root,
        {
            data: [{ y: data }],
            traces: [0],
            layout: { yaxis: { title: label }, title: title },
        },
        transitionTrace
    );
    await Plotly.animate(
        root,
        { layout: { yaxis: { range: dataRange } } },
        transitionLayout
    );
}

function multipleTraceFigure(container, button, abscissa, ordinates) {
    const figureContainer = container.appendChild(
        document.createElement('div')
    );
    figureContainer.classList.add('summary-figure-container');
    const figureWrapper = figureContainer.appendChild(
        document.createElement('div')
    );
    figureWrapper.classList.add('summary-figure-wrapper');
    const buttonDiv = figureWrapper.appendChild(document.createElement('div'));
    buttonDiv.classList.add('summary-figure-button-div');
    const plotlyRoot = figureWrapper.appendChild(document.createElement('div'));
    plotlyRoot.classList.add('summary-figure-plot-div');
    button.addEventListener('click', e => {
        e.preventDefault();

        //create figure if not exist
        if (plotlyRoot.childElementCount == 0) {
            const { title, tag, data } = ordinates[0];
            Plotly.newPlot(
                plotlyRoot,
                [{ x: abscissa.data, y: data, line: { simplify: false } }],
                {
                    xaxis: { title: abscissa.tag },
                    yaxis: { title: { text: tag } },
                    height: 400,
                    title: title,
                    paper_bgcolor: 'rgb(227,248,241)',
                    plot_bgcolor: 'rgb(227,248,241)',
                }
            );
        }

        figureContainer.classList.toggle('summary-figure-container-show');
    });

    for (const { title, tag, data, buttonText } of ordinates) {
        const btn = buttonDiv.appendChild(document.createElement('button'));
        btn.innerHTML = buttonText ?? title;
        btn.addEventListener('click', e => {
            e.preventDefault();
            transitionTo(plotlyRoot, data, tag, title);
        });
    }
}

function lerp(a, b, x) {
    return a + (b - a) * x;
}

function linearMap(x, a0, b0, a1, b1) {
    return lerp(a1, b1, (x - a0) / (b0 - a0));
}

function lower_bound(array, val) {
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

function interpolationDerivativeAt(x, xs, ys) {
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

function derivative(xs, ys) {
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

function zip(func, ...arrays) {
    return arrays[0].map((_, i) => func(...arrays.map(arr => arr[i])));
}

function minmax(as, padding = 0) {
    let min = Infinity;
    let max = -Infinity;
    as.forEach(v => {
        min = Math.min(min, v);
        max = Math.max(max, v);
    });
    return [min - (max - min) * padding, max + (max - min) * padding];
}
