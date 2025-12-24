import {headingFromDelta, perpendicularHeading} from "./geometry";
import {normDeg, shortestDeltaDeg} from "./math";
import {sampleCircularArcThrough, sampleQuadraticBezier} from "./path";

export const computeHeadingFromMode = (headingMode, tangent, prev, straightHeading) => {
    const dx = tangent?.dx ?? 0;
    const dy = tangent?.dy ?? 0;
    if (headingMode === "straight") return straightHeading;
    if (headingMode === "tangent") return headingFromDelta(dx, dy);
    if (headingMode === "orth-left") return perpendicularHeading(dx, dy, true);
    if (headingMode === "orth-right") return perpendicularHeading(dx, dy, false);
    return prev?.h ?? 0;
};

const applySampleHeadings = (samples, anchor, headingMode, endHeading, endHeadingOverride) => {
    const out = [];
    let prev = anchor;
    samples.forEach((sample) => {
        const tangent = sample.tangent ?? {dx: sample.x - prev.x, dy: sample.y - prev.y};
        const heading = computeHeadingFromMode(headingMode, tangent, prev, endHeading);
        const next = {x: sample.x, y: sample.y, h: heading};
        out.push(next);
        prev = next;
    });
    if (out.length && Number.isFinite(endHeadingOverride)) {
        out[out.length - 1] = {...out[out.length - 1], h: endHeadingOverride};
    }
    return out;
};

const applyStraightTransition = (samples, anchor, endHeading, endHeadingOverride) => {
    const out = [];
    const startHeading = Number.isFinite(anchor?.h) ? anchor.h : 0;
    const targetHeading = Number.isFinite(endHeadingOverride) ? endHeadingOverride : endHeading;
    const safeTarget = Number.isFinite(targetHeading) ? targetHeading : startHeading;
    const delta = shortestDeltaDeg(startHeading, safeTarget);
    const lastIndex = Math.max(1, samples.length - 1);

    samples.forEach((sample, index) => {
        const t = samples.length <= 1 ? 1 : index / lastIndex;
        const heading = normDeg(startHeading + delta * t);
        out.push({x: sample.x, y: sample.y, h: heading});
    });

    if (out.length && Number.isFinite(targetHeading)) {
        out[out.length - 1] = {...out[out.length - 1], h: targetHeading};
    }

    return out;
};

export const buildLineSegment = ({anchor, end, headingMode, endHeading, endHeadingOverride}) => {
    const sample = {x: end.x, y: end.y, tangent: {dx: end.x - anchor.x, dy: end.y - anchor.y}};
    const samples = applySampleHeadings([sample], anchor, headingMode, endHeading, endHeadingOverride);
    const last = samples[samples.length - 1];
    return {
        type: "line",
        end: {x: last.x, y: last.y, h: last.h},
        samples,
    };
};

export const buildBezierSegment = ({anchor, control, end, headingMode, endHeading, endHeadingOverride}) => {
    const rawSamples = sampleQuadraticBezier(anchor, control, end);
    const samples =
        headingMode === "straight"
            ? applyStraightTransition(rawSamples, anchor, endHeading, endHeadingOverride)
            : applySampleHeadings(rawSamples, anchor, headingMode, endHeading, endHeadingOverride);
    const last = samples[samples.length - 1];
    return {
        type: "bezier",
        control: {x: control.x, y: control.y},
        end: {x: last.x, y: last.y, h: last.h},
        samples,
    };
};

export const buildArcSegment = ({anchor, mid, end, headingMode, endHeading, endHeadingOverride}) => {
    const rawSamples = sampleCircularArcThrough(anchor, mid, end);
    const samples =
        headingMode === "straight"
            ? applyStraightTransition(rawSamples, anchor, endHeading, endHeadingOverride)
            : applySampleHeadings(rawSamples, anchor, headingMode, endHeading, endHeadingOverride);
    const last = samples[samples.length - 1];
    return {
        type: "arc",
        mid: {x: mid.x, y: mid.y},
        end: {x: last.x, y: last.y, h: last.h},
        samples,
    };
};
