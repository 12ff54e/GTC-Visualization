export declare enum BC {
    na = 0,
    natural = 1,
    clamped = 2,
    not_a_knot = 3,
    periodic = 4
}
export declare class Spline1d {
    gridPts: number[];
    gridLength: number;
    coefficientArray: number[][];
    equalGridLength: boolean;
    order: number;
    boundaryCondition: BC;
    constructor(xs: number | number[], ys: number[], options?: {
        order?: number;
        boundaryCondition?: BC;
        boundaryValues?: [number, number];
    });
    at(x: number): number;
}
export declare class Spline2d {
    gridPtX: number[];
    gridPtY: number[];
    coefficientArray: number[][][];
    order: number;
    boundaryCondition: {
        x: BC;
        y: BC;
    };
    constructor(xs: number[], ys: number[], zs: number[][], options?: {
        xBoundaryCondition?: BC;
        yBoundaryCondition?: BC;
        order?: number;
    });
    at(x: number, y: number): number;
}
