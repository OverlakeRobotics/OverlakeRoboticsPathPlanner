import {ARC_MAX_SAMPLES, BEZIER_MAX_SAMPLES, BEZIER_MIN_SAMPLES, PATH_SAMPLE_STEP_IN} from "../constants/config";
import {clamp} from "./math";

export const polylineLength = (points) => {
    if (!points || points.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1];
        const curr = points[i];
        total += Math.hypot(curr.x - prev.x, curr.y - prev.y);
    }
    return total;
};

export const getSegmentProgress = (points, distance) => {
    if (!points || points.length < 2) return null;
    const total = polylineLength(points);
    let remaining = clamp(distance, 0, total);
    for (let i = 0; i < points.length - 1; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        const seg = Math.hypot(b.x - a.x, b.y - a.y);
        if (seg <= 1e-6) continue;
        if (remaining <= seg) {
            const t = remaining / seg;
            return {
                i,
                t,
                a,
                b,
                segLen: seg,
                pos: {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t},
            };
        }
        remaining -= seg;
    }
    const i = points.length - 2;
    const a = points[i];
    const b = points[i + 1];
    return {
        i,
        t: 1,
        a,
        b,
        segLen: Math.hypot(b.x - a.x, b.y - a.y),
        pos: {x: b.x, y: b.y},
    };
};

export const sampleQuadraticBezier = (A, C, B) => {
    const approx = Math.hypot(C.x - A.x, C.y - A.y) + Math.hypot(B.x - C.x, B.y - C.y);
    const count = clamp(Math.ceil(approx / PATH_SAMPLE_STEP_IN), BEZIER_MIN_SAMPLES, BEZIER_MAX_SAMPLES);
    const out = [];
    for (let i = 1; i <= count; i += 1) {
        const t = i / count;
        const omt = 1 - t;
        const x = omt * omt * A.x + 2 * omt * t * C.x + t * t * B.x;
        const y = omt * omt * A.y + 2 * omt * t * C.y + t * t * B.y;
        const dx = 2 * omt * (C.x - A.x) + 2 * t * (B.x - C.x);
        const dy = 2 * omt * (C.y - A.y) + 2 * t * (B.y - C.y);
        out.push({x, y, tangent: {dx, dy}});
    }
    return out;
};

export const sampleCircularArcThrough = (A, M, B) => {
    const {x: x1, y: y1} = A;
    const {x: x2, y: y2} = M;
    const {x: x3, y: y3} = B;
    const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    if (Math.abs(d) < 1e-6) {
        const len = Math.hypot(B.x - A.x, B.y - A.y);
        const count = clamp(Math.ceil(len / PATH_SAMPLE_STEP_IN), BEZIER_MIN_SAMPLES, BEZIER_MAX_SAMPLES);
        const out = [];
        for (let i = 1; i <= count; i += 1) {
            const t = i / count;
            const x = A.x + (B.x - A.x) * t;
            const y = A.y + (B.y - A.y) * t;
            out.push({x, y, tangent: {dx: B.x - A.x, dy: B.y - A.y}});
        }
        return out;
    }
    const ux = ((x1 * x1 + y1 * y1) * (y2 - y3) + (x2 * x2 + y2 * y2) * (y3 - y1) + (x3 * x3 + y3 * y3) * (y1 - y2)) / d;
    const uy = ((x1 * x1 + y1 * y1) * (x3 - x2) + (x2 * x2 + y2 * y2) * (x1 - x3) + (x3 * x3 + y3 * y3) * (x2 - x1)) / d;
    const thetaA = Math.atan2(y1 - uy, x1 - ux);
    const thetaM = Math.atan2(y2 - uy, x2 - ux);
    const thetaB = Math.atan2(y3 - uy, x3 - ux);
    const norm = (a) => (a % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const spanCCW = (norm(thetaB) - norm(thetaA) + 2 * Math.PI) % (2 * Math.PI);
    const mSpanCCW = (norm(thetaM) - norm(thetaA) + 2 * Math.PI) % (2 * Math.PI);
    const passesCCW = mSpanCCW <= spanCCW + 1e-9;
    let delta = passesCCW
        ? spanCCW
        : -((norm(thetaA) - norm(thetaB) + 2 * Math.PI) % (2 * Math.PI));
    const radius = Math.hypot(x1 - ux, y1 - uy);
    const arcLen = Math.abs(radius * delta);
    const count = clamp(Math.ceil(arcLen / PATH_SAMPLE_STEP_IN), BEZIER_MIN_SAMPLES, ARC_MAX_SAMPLES);
    const out = [];
    for (let i = 1; i <= count; i += 1) {
        const t = i / count;
        const theta = thetaA + delta * t;
        const x = ux + radius * Math.cos(theta);
        const y = uy + radius * Math.sin(theta);
        const dir = delta > 0 ? 1 : -1;
        const dx = -radius * Math.sin(theta) * dir;
        const dy = radius * Math.cos(theta) * dir;
        out.push({x, y, tangent: {dx, dy}});
    }
    return out;
};
