import {EPS, MIN_DRAW_SAMPLE_SPACING_IN, MIN_DRAW_SEGMENT_LEN_IN, TWO_PI} from "../constants/config";
import {polylineLength, sampleCircularArcThrough, sampleQuadraticBezier} from "./path";

const distance = (a, b) => Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0));

const pointLineDistance = (p, a, b) => {
    const dx = (b.x ?? 0) - (a.x ?? 0);
    const dy = (b.y ?? 0) - (a.y ?? 0);
    const denom = Math.hypot(dx, dy);
    if (denom < EPS) return 0;
    return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / denom;
};

const normalizeAnglePi = (angle) => {
    let a = angle % TWO_PI;
    if (a <= -Math.PI) a += TWO_PI;
    if (a > Math.PI) a -= TWO_PI;
    return a;
};

const fitLine = (anchor, end, samples) => {
    const length = distance(anchor, end);
    if (length < MIN_DRAW_SEGMENT_LEN_IN) return null;
    let err = 0;
    samples.forEach((p) => {
        err += pointLineDistance(p, anchor, end) ** 2;
    });
    const rms = Math.sqrt(err / samples.length);
    return {
        type: "line",
        end,
        error: rms,
        length,
        label: "Line",
        previewSamples: [anchor, end],
    };
};

const fitCircleLeastSquares = (points) => {
    const n = points.length;
    if (n < 3) return null;
    let sumX = 0;
    let sumY = 0;
    let sumX2 = 0;
    let sumY2 = 0;
    let sumXY = 0;
    let sumX3 = 0;
    let sumY3 = 0;
    let sumX1Y2 = 0;
    let sumX2Y1 = 0;
    for (const {x, y} of points) {
        const x2 = x * x;
        const y2 = y * y;
        sumX += x;
        sumY += y;
        sumX2 += x2;
        sumY2 += y2;
        sumXY += x * y;
        sumX3 += x2 * x;
        sumY3 += y2 * y;
        sumX1Y2 += x * y2;
        sumX2Y1 += x2 * y;
    }
    const C = n * sumX2 - sumX * sumX;
    const D = n * sumXY - sumX * sumY;
    const E = n * sumY2 - sumY * sumY;
    const G = 0.5 * (n * (sumX3 + sumX1Y2) - (sumX2 + sumY2) * sumX);
    const H = 0.5 * (n * (sumY3 + sumX2Y1) - (sumX2 + sumY2) * sumY);
    const denom = C * E - D * D;
    if (Math.abs(denom) < EPS) return null;
    const cx = (G * E - D * H) / denom;
    const cy = (C * H - D * G) / denom;
    const radius = Math.sqrt(Math.max(0, (sumX2 + sumY2 - 2 * cx * sumX - 2 * cy * sumY) / n + cx * cx + cy * cy));
    if (!Number.isFinite(radius) || radius < MIN_DRAW_SEGMENT_LEN_IN / 2) return null;
    return {center: {x: cx, y: cy}, radius};
};

const computeAngularSpan = (points, center) => {
    let acc = 0;
    for (let i = 1; i < points.length; i += 1) {
        const prev = Math.atan2(points[i - 1].y - center.y, points[i - 1].x - center.x);
        const curr = Math.atan2(points[i].y - center.y, points[i].x - center.x);
        acc += normalizeAnglePi(curr - prev);
    }
    return acc;
};

const fitArc = (anchor, rawSamples) => {
    if (rawSamples.length < 3) return null;
    const circle = fitCircleLeastSquares(rawSamples);
    if (!circle) return null;
    const {center, radius} = circle;
    const end = rawSamples[rawSamples.length - 1];
    const thetaStart = Math.atan2(anchor.y - center.y, anchor.x - center.x);
    const thetaEnd = Math.atan2(end.y - center.y, end.x - center.x);
    const orientation = computeAngularSpan(rawSamples, center);
    if (Math.abs(orientation) < EPS) return null;
    let delta = normalizeAnglePi(thetaEnd - thetaStart);
    if (orientation > 0 && delta < 0) delta += TWO_PI;
    if (orientation < 0 && delta > 0) delta -= TWO_PI;
    const arcLen = Math.abs(delta * radius);
    if (!Number.isFinite(arcLen) || arcLen < MIN_DRAW_SEGMENT_LEN_IN) return null;

    // Evaluate radial error
    let err = 0;
    rawSamples.forEach((p) => {
        const radial = Math.hypot(p.x - center.x, p.y - center.y);
        err += (radial - radius) ** 2;
    });
    const rms = Math.sqrt(err / rawSamples.length);

    const midAngle = thetaStart + delta / 2;
    const mid = {
        x: center.x + radius * Math.cos(midAngle),
        y: center.y + radius * Math.sin(midAngle),
    };

    const samples = sampleCircularArcThrough(anchor, mid, end);
    if (!samples.length) return null;

    return {
        type: "arc",
        end,
        error: rms,
        center,
        radius,
        delta,
        mid,
        length: arcLen,
        label: "Arc",
        previewSamples: [anchor, ...samples.map((s) => ({x: s.x, y: s.y}))],
    };
};

const fitQuadraticBezier = (anchor, rawSamples) => {
    if (rawSamples.length < 3) return null;
    const end = rawSamples[rawSamples.length - 1];
    const totalLen = polylineLength(rawSamples);
    if (!(totalLen > MIN_DRAW_SEGMENT_LEN_IN)) return null;
    const distances = [0];
    for (let i = 1; i < rawSamples.length; i += 1) {
        distances[i] = distances[i - 1] + distance(rawSamples[i - 1], rawSamples[i]);
    }
    const total = distances[distances.length - 1];
    if (total < EPS) return null;

    let weightSum = 0;
    let controlX = 0;
    let controlY = 0;
    for (let i = 1; i < rawSamples.length - 1; i += 1) {
        const t = distances[i] / total;
        const omt = 1 - t;
        const denom = 2 * omt * t;
        if (denom < EPS) continue;
        const baseX = omt * omt * anchor.x + t * t * end.x;
        const baseY = omt * omt * anchor.y + t * t * end.y;
        const weight = denom * denom;
        controlX += weight * ((rawSamples[i].x - baseX) / denom);
        controlY += weight * ((rawSamples[i].y - baseY) / denom);
        weightSum += weight;
    }
    if (weightSum < EPS) return null;
    const control = {x: controlX / weightSum, y: controlY / weightSum};

    let err = 0;
    rawSamples.forEach((sample, index) => {
        const t = distances[index] / total;
        const omt = 1 - t;
        const bx = omt * omt * anchor.x + 2 * omt * t * control.x + t * t * end.x;
        const by = omt * omt * anchor.y + 2 * omt * t * control.y + t * t * end.y;
        err += (sample.x - bx) ** 2 + (sample.y - by) ** 2;
    });
    const rms = Math.sqrt(err / rawSamples.length);

    const samples = sampleQuadraticBezier(anchor, control, end);
    return {
        type: "bezier",
        end,
        error: rms,
        control,
        length: total,
        label: "Curve",
        previewSamples: [anchor, ...samples.map((s) => ({x: s.x, y: s.y}))],
    };
};

const PENALTY_BY_TYPE = {
    line: 0.12,
    arc: 0.04,
    bezier: 0,
};

export const computeDrawCandidates = (anchor, rawSamples) => {
    if (!anchor || !rawSamples || rawSamples.length < 2) {
        return {candidates: [], bestIndex: -1};
    }

    const start = rawSamples[0];
    const anchorCopy = {...anchor};
    const samplesWithAnchor = distance(start, anchor) > EPS ? [anchorCopy, ...rawSamples] : rawSamples.slice();
    const unique = [];
    samplesWithAnchor.forEach((p) => {
        if (!unique.length || distance(unique[unique.length - 1], p) > EPS) unique.push(p);
    });
    if (unique.length < 2) return {candidates: [], bestIndex: -1};

    const endPoint = unique[unique.length - 1];
    const candidates = [];

    const lineCandidate = fitLine(anchorCopy, endPoint, unique);
    if (lineCandidate) candidates.push({...lineCandidate, anchor: anchorCopy});

    const arcCandidate = fitArc(anchorCopy, unique);
    if (arcCandidate) {
        candidates.push({...arcCandidate, anchor: anchorCopy});
    }

    const bezierCandidate = fitQuadraticBezier(anchorCopy, unique);
    if (bezierCandidate) {
        candidates.push({...bezierCandidate, anchor: anchorCopy});
    }

    if (!candidates.length) return {candidates: [], bestIndex: -1};

    let bestIndex = 0;
    let bestScore = Infinity;
    candidates.forEach((candidate, index) => {
        const penalty = PENALTY_BY_TYPE[candidate.type] ?? 0;
        const score = candidate.error + penalty;
        candidate.score = score;
        if (score < bestScore) {
            bestScore = score;
            bestIndex = index;
        }
    });

    return {candidates, bestIndex};
};

export const computeBestFit = (anchor, rawSamples) => {
    const {candidates, bestIndex} = computeDrawCandidates(anchor, rawSamples);
    if (!candidates.length || bestIndex < 0) return null;
    return candidates[bestIndex];
};
