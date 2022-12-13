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
    const fft = window.GTCGlobal.Fourier.spectrum(reals, images);

    const len = reals.length;
    const halfLen = Math.floor(len / 2);

    return {
        x: [...Array(len).keys()].map(
            (i) => ((2 * Math.PI) / (len * timeStep)) * (i - halfLen)
        ),
        y: Array.from(fft.slice(len - halfLen)).concat(
            Array.from(fft.slice(0, len - halfLen))
        ),
    };
}
