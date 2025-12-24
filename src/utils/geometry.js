import {FIELD_EDGE_IN} from "../constants/config";
import {degToRad, radToDeg} from "./math";

export const worldToCanvas = (x, y, cx, cy, ppi) => ({
    cx: cx - y * ppi,
    cy: cy - x * ppi,
});

export const canvasToWorld = (cx, cy, cx0, cy0, ppi) => ({
    x: (cy0 - cy) / ppi,
    y: (cx0 - cx) / ppi,
});

export const headingFromDelta = (dx, dy) => radToDeg(Math.atan2(dy, dx));

export const perpendicularHeading = (dx, dy, left = true) => {
    const vx = left ? -dy : dy;
    const vy = left ? dx : -dx;
    return radToDeg(Math.atan2(vy, vx));
};

export const headingVector = (headingDeg, length) => {
    const vx = Math.cos(degToRad(headingDeg));
    const vy = Math.sin(degToRad(headingDeg));
    return {dx: -vy * length, dy: -vx * length};
};

export const rotateLocalToWorld = (lx, ly, headingDeg) => {
    const angle = degToRad(headingDeg);
    return {
        x: lx * Math.cos(angle) - ly * Math.sin(angle),
        y: lx * Math.sin(angle) + ly * Math.cos(angle),
    };
};

export const snapToField = (x, y, step, fieldSize) => {
    const half = Number.isFinite(fieldSize) && fieldSize > 0 ? fieldSize / 2 : FIELD_EDGE_IN;
    if (!step || step <= 0) {
        return {
            x: Math.max(-half, Math.min(half, x)),
            y: Math.max(-half, Math.min(half, y)),
        };
    }
    const origin = -half;
    const sx = origin + Math.round((x - origin) / step) * step;
    const sy = origin + Math.round((y - origin) / step) * step;
    return {
        x: Math.max(-half, Math.min(half, sx)),
        y: Math.max(-half, Math.min(half, sy)),
    };
};
