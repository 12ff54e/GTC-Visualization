'use strict';

const TWO_PI = 2 * Math.PI;

function requirePositive(value, name) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(`${name} must be positive`);
    }
}

/**
 * Interpolate q at the snapshot diagnostic surface.
 * Equilibrium rg_n and radial_region use the same normalized radial coordinate.
 */
export function diagnosticSafetyFactor(safetyFactor, parameters) {
    if (
        !safetyFactor?.x?.length ||
        safetyFactor.x.length !== safetyFactor.y?.length
    ) {
        throw new Error('Safety-factor profile is unavailable');
    }

    const [radialStart, radialEnd] = parameters.radial_region;
    const fluxIndex = parameters.diag_flux ?? parameters.iflux;
    const radialPosition =
        radialStart +
        (fluxIndex / parameters.mpsi) * (radialEnd - radialStart);
    const x = safetyFactor.x;
    const y = safetyFactor.y;

    if (radialPosition <= x[0]) return y[0];
    if (radialPosition >= x.at(-1)) return y.at(-1);

    for (let index = 0; index < x.length - 1; index++) {
        if (radialPosition <= x[index + 1]) {
            const fraction =
                (radialPosition - x[index]) / (x[index + 1] - x[index]);
            return y[index] + fraction * (y[index + 1] - y[index]);
        }
    }
    throw new Error('Unable to interpolate the safety factor');
}

/**
 * Transform f(zeta, theta_f) into its physical (m, n) spectrum.
 *
 * GTC uses theta_f = theta - zeta / q. After the theta_f FFT, multiplying
 * mode m by exp(-i m zeta / q) converts it to a theta coefficient. A complex
 * FFT in zeta then completes the separable two-dimensional transform.
 */
export function fieldAlignedSpectrum(field, safetyFactor, toroidalN, fft) {
    requirePositive(safetyFactor, 'safety factor');
    requirePositive(toroidalN, 'toroidaln');
    if (!Array.isArray(field) || field.length === 0 || field[0].length === 0) {
        throw new RangeError('field must be a nonempty rectangular matrix');
    }

    const zetaCount = field.length;
    const thetaCount = field[0].length;
    const thetaModeCount = Math.floor(thetaCount / 2) + 1;
    const thetaSpectrumStride = thetaModeCount * 2;
    const fieldValues = new Float64Array(zetaCount * thetaCount);

    for (let zetaIndex = 0; zetaIndex < zetaCount; zetaIndex++) {
        if (field[zetaIndex].length !== thetaCount) {
            throw new RangeError('field must be rectangular');
        }
        fieldValues.set(field[zetaIndex], zetaIndex * thetaCount);
    }

    const thetaFSpectrum = fft.r2c1dBatch(fieldValues, thetaCount);
    const zetaTransforms = new Float64Array(
        thetaModeCount * zetaCount * 2
    );

    for (let thetaMode = 0; thetaMode < thetaModeCount; thetaMode++) {
        for (let zetaIndex = 0; zetaIndex < zetaCount; zetaIndex++) {
            const source =
                zetaIndex * thetaSpectrumStride + thetaMode * 2;
            const destination =
                (thetaMode * zetaCount + zetaIndex) * 2;
            const zeta =
                (TWO_PI * zetaIndex) / (zetaCount * toroidalN);
            const phase = (-thetaMode * zeta) / safetyFactor;
            const cosine = Math.cos(phase);
            const sine = Math.sin(phase);
            const real = thetaFSpectrum[source];
            const imaginary = thetaFSpectrum[source + 1];
            zetaTransforms[destination] = real * cosine - imaginary * sine;
            zetaTransforms[destination + 1] =
                real * sine + imaginary * cosine;
        }
    }

    const transformed = fft.c2c1dBatch(zetaTransforms, zetaCount);
    const toroidalBins = Array.from({ length: zetaCount }, (_, index) => {
        const signedWaveNumber =
            index <= Math.floor((zetaCount - 1) / 2)
                ? index
                : index - zetaCount;
        return {
            index,
            mode: -signedWaveNumber * toroidalN,
        };
    }).sort((left, right) => left.mode - right.mode);

    const normalization = thetaCount * zetaCount;
    const amplitude = Array.from({ length: thetaModeCount }, (_, thetaMode) =>
        toroidalBins.map(({ index }) => {
            const offset = (thetaMode * zetaCount + index) * 2;
            return (
                Math.hypot(transformed[offset], transformed[offset + 1]) /
                normalization
            );
        })
    );

    return {
        thetaModes: Array.from(
            { length: thetaModeCount },
            (_, index) => index
        ),
        toroidalModes: toroidalBins.map(({ mode }) => mode),
        amplitude,
    };
}
