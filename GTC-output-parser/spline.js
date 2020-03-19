"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var BC;
(function (BC) {
    BC[BC["na"] = 0] = "na";
    BC[BC["natural"] = 1] = "natural";
    BC[BC["clamped"] = 2] = "clamped";
    BC[BC["not_a_knot"] = 3] = "not_a_knot";
    BC[BC["periodic"] = 4] = "periodic";
})(BC = exports.BC || (exports.BC = {}));
class Spline1d {
    constructor(xs, ys, options) {
        this.gridPts = [];
        this.gridLength = 1;
        this.order = 3;
        this.boundaryCondition = BC.natural;
        const n = ys.length - 1;
        // boundary values is needed when boundary condition is specified as 'clamped'
        let bv = [0, 0];
        // read extra options
        if (options) {
            let { order, boundaryCondition, boundaryValues } = options;
            this.order = order !== null && order !== void 0 ? order : this.order;
            this.boundaryCondition = boundaryCondition
                ? boundaryCondition
                : BC.natural;
            if (this.boundaryCondition == BC.clamped && !boundaryValues) {
                this.boundaryCondition = BC.natural;
            }
            if (boundaryValues)
                bv = boundaryValues;
        }
        if ((this.equalGridLength = typeof xs === 'number')) {
            this.gridLength = xs;
        }
        else {
            this.gridPts = xs.slice();
        }
        this.coefficientArray = [];
        const diff = []; // dy/dx
        const h = []; // dx
        for (let i = 0; i < n; i++) {
            const dx = this.equalGridLength
                ? this.gridLength
                : this.gridPts[i + 1] - this.gridPts[i];
            h.push(dx);
            diff.push((ys[i + 1] - ys[i]) / dx);
        }
        if (this.order === 1) {
            // linear interpolation, no extra eq is needed
            diff.forEach((d, i) => this.coefficientArray.push([ys[i], d]));
            this.boundaryCondition = BC.na;
        }
        else if (this.order === 2) {
            // squere spline, mandatorily use natural boundary condition at left
            //  since one meets a singular coefficient matrix when trying to use
            //  periodic BC on a grid of odd grid points
            this.coefficientArray.push([ys[0], diff[0], 0]);
            for (let i = 1; i < diff.length; i++) {
                const b = 2 * diff[i - 1] - this.coefficientArray[i - 1][1];
                this.coefficientArray.push([ys[i], b, (diff[i] - b) / h[i]]);
            }
            this.boundaryCondition = BC.natural;
        }
        else if (this.order === 3) {
            // cubic spline
            const eqMat = Array.from({ length: n + 1 }, _ => Array(ys.length));
            const eqVec = new Array();
            switch (this.boundaryCondition) {
                case BC.clamped:
                    eqMat[0][0] = 2 * h[0];
                    eqMat[0][1] = h[0];
                    eqMat[n][n] = 2 * h[n - 1];
                    eqMat[n][n - 1] = h[n - 1];
                    eqVec[0] = 6 * ((ys[1] - ys[0]) / h[0] - bv[0]);
                    eqVec[n] = 6 * (bv[1] - (ys[n] - ys[n - 1]) / h[n - 1]);
                    break;
                case BC.not_a_knot:
                    eqMat[0][0] = -h[1];
                    eqMat[0][1] = h[0] + h[1];
                    eqMat[0][2] = -h[0];
                    eqMat[n][n] = -h[n - 2];
                    eqMat[n][n - 1] = h[n - 2] + h[n - 1];
                    eqMat[n][n - 2] = -h[n - 1];
                    eqVec[0] = eqVec[n] = 0;
                    break;
                case BC.periodic:
                    eqMat[0][0] = 1;
                    eqMat[0][n] = -1;
                    eqMat[n][0] = 2;
                    eqMat[n][1] = 1;
                    eqMat[n][n - 1] = -h[n - 1] / h[0];
                    eqMat[n][n] = (-2 * h[n - 1]) / h[0];
                    eqVec[0] = 0;
                    eqVec[n] = (6 * (diff[0] + diff[n - 1])) / h[0];
                    break;
                case BC.natural:
                default:
                    eqMat[0][0] = 1;
                    eqMat[n][n] = 1;
                    eqVec[0] = eqVec[n] = 0;
            }
            for (let i = 1; i < n; i++) {
                eqMat[i][i - 1] = h[i - 1];
                eqMat[i][i] = 2 * (h[i - 1] + h[i]);
                eqMat[i][i + 1] = h[i];
                eqVec[i] = 6 * (diff[i] - diff[i - 1]);
            }
            // relaxation coefficient equals to 1, sor degenerated to gauss-seidel
            const m = sor(eqMat, eqVec, Array(n + 1).fill(0), 1);
            for (let i = 0; i < diff.length; i++) {
                const tmp = (m[i + 1] - m[i]) / 6;
                this.coefficientArray.push([
                    ys[i],
                    diff[i] - h[i] * (tmp + m[i] / 2),
                    m[i] / 2,
                    tmp / h[i]
                ]);
            }
        }
    }
    at(x) {
        let i = -1;
        if (this.equalGridLength) {
            i = Math.floor(x / this.gridLength);
        }
        else {
            while (x > this.gridPts[i + 1]) {
                i++;
            }
            if (x == this.gridPts[0])
                i = 0;
        }
        if (i < 0 || i > this.gridPts.length - 2) {
            throw new RangeError(`${x} lies outside spline domain!`);
        }
        const dx = this.equalGridLength
            ? x - i * this.gridLength
            : x - this.gridPts[i];
        return this.coefficientArray[i].reduce((acc, curr, pow) => acc + curr * Math.pow(dx, pow), 0);
    }
}
exports.Spline1d = Spline1d;
class Spline2d {
    constructor(xs, ys, zs, options) {
        this.gridPtX = [];
        this.gridPtY = [];
        this.order = 3;
        this.boundaryCondition = { x: BC.natural, y: BC.natural };
        // set default parameters
        if (options) {
            const { xBoundaryCondition, yBoundaryCondition, order } = options;
            this.boundaryCondition = {
                x: xBoundaryCondition !== null && xBoundaryCondition !== void 0 ? xBoundaryCondition : BC.natural,
                y: yBoundaryCondition !== null && yBoundaryCondition !== void 0 ? yBoundaryCondition : BC.natural
            };
            this.order = order === 1 ? 1 : 3;
        }
        // initialize coefficient array
        this.coefficientArray = Array.from({ length: ys.length - 1 }, _ => Array.from({ length: xs.length - 1 }, _ => []));
        // copy grid point coordinates
        this.gridPtX = xs.slice();
        this.gridPtY = ys.slice();
        // each entry is a spline along line y=const
        const splinesAlongX = zs.map(xRow => new Spline1d(xs, xRow, {
            boundaryCondition: this.boundaryCondition.x,
            order: this.order
        }));
        for (let i = 0; i < xs.length - 1; i++) {
            // [[a],[b],[c]?,[d]?] along line x=const
            const valueAlongY = Array.from({ length: this.order + 1 }, _ => []);
            for (let j = 0; j < ys.length; j++) {
                splinesAlongX[j].coefficientArray[i].forEach((c, o) => {
                    valueAlongY[o].push(c);
                });
            }
            // spline of spline coefficients
            const splinesAlongY = valueAlongY.map(cs => new Spline1d(ys, cs, {
                boundaryCondition: this.boundaryCondition.y,
                order: this.order
            }));
            for (let j = 0; j < ys.length - 1; j++) {
                splinesAlongY.forEach(spline => {
                    this.coefficientArray[j][i].push(...spline.coefficientArray[j]);
                });
            }
        }
    }
    at(x, y) {
        let i = -1, j = -1;
        while (x > this.gridPtX[i + 1]) {
            i++;
        }
        if (x == this.gridPtX[0])
            i = 0;
        while (y > this.gridPtY[j + 1]) {
            j++;
        }
        if (y == this.gridPtY[0])
            j = 0;
        if (i < 0 ||
            i > this.gridPtX.length - 2 ||
            j < 0 ||
            j > this.gridPtY.length - 2) {
            throw new RangeError(`(${x}, ${y}) lies outside spline area!`);
        }
        const dx = x - this.gridPtX[i];
        const dy = y - this.gridPtY[j];
        return this.coefficientArray[j][i].reduce((acc, curr, ind) => acc +
            curr *
                Math.pow(dx, Math.floor(ind / (this.order + 1))) *
                Math.pow(dy, ind % (this.order + 1)), 0);
    }
}
exports.Spline2d = Spline2d;
function sor(a, b, x0, relaxCoef, iter = 100, tolerence = 1e-8) {
    let x = x0.slice();
    let tol = 0;
    for (let i = 0; i < iter; i++) {
        for (let row = 0; row < a.length; row++) {
            let x_old = x[row];
            const l = row == 0
                ? 0
                : a[row].slice().reduce((acc, curr, col, arr) => {
                    if (col == row - 1)
                        arr.splice(0);
                    return acc + curr * x[col];
                }, 0);
            const r = row == a.length - 1
                ? 0
                : a[row].slice().reduceRight((acc, curr, col, arr) => {
                    if (col == row + 1)
                        arr.splice(0);
                    return acc + curr * x[col];
                }, 0);
            x[row] =
                (1 - relaxCoef) * x_old +
                    (relaxCoef * (b[row] - r - l)) / a[row][row];
            tol += Math.abs(x[row] - x_old);
        }
        if ((tol /= b.length) < tolerence)
            break;
        tol = 0;
    }
    return x;
}
//# sourceMappingURL=spline.js.map