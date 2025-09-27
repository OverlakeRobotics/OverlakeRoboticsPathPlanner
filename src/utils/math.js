export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const toFixed = (value, precision = 2) => Number(value).toFixed(precision);

export const degToRad = (degrees) => (degrees * Math.PI) / 180;

export const radToDeg = (radians) => (radians * 180) / Math.PI;

export function normDeg(angle) {
    let a = angle % 360;
    if (a > 180) a -= 360;
    if (a <= -180) a += 360;
    return a;
}

export const shortestDeltaDeg = (from, to) => ((to - from + 540) % 360) - 180;

export const num = (value) => {
    if (typeof value === "number") return value;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
