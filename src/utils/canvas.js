import {FIELD_SIZE_IN} from "../constants/config";
import {headingVector, perpendicularHeading} from "./geometry";
import {canvasToWorld, headingFromDelta, rotateLocalToWorld, snapToField, worldToCanvas} from "./geometry";
import {getSegmentProgress, sampleCircularArcThrough, sampleQuadraticBezier} from "./path";
import {num, normDeg, shortestDeltaDeg} from "./math";

const PATH_COLOR = "#5cd2ff";
const START_COLOR = "#ffd166";
const WAYPOINT_COLOR = "#cbd5e1";
const LAST_POINT_COLOR = "#ffffff";
const FOOTPRINT_FILL = "#6be675";
const LIVE_POSE_FILL = "#ff6ad5";
const PREVIEW_FILL = "#94e2b8";

export const prepareCanvas = (canvas, overlay, size, dpr) => {
    const width = size * dpr;
    const height = size * dpr;
    [canvas, overlay].forEach((element) => {
        if (!element) return;
        element.width = width;
        element.height = height;
        element.style.width = `${size}px`;
        element.style.height = `${size}px`;
        const ctx = element.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
};

export const drawPlannerScene = ({
    canvasCtx,
    overlayCtx,
    canvasSize,
    backgroundImage,
    showGrid,
    gridStep,
    center,
    ppi,
    startPose,
    points,
    preview,
    headingMode,
    endHeading,
    shapeType,
    bezierTemp,
    arcTemp,
    placeStart,
    robot,
    livePose,
    playState,
    playDist,
    waypoints,
}) => {
    if (!canvasCtx || !overlayCtx) return;

    canvasCtx.clearRect(0, 0, canvasSize, canvasSize);
    if (backgroundImage && backgroundImage.complete) {
        const scale = Math.max(canvasSize / backgroundImage.width, canvasSize / backgroundImage.height);
        const dw = backgroundImage.width * scale;
        const dh = backgroundImage.height * scale;
        const dx = (canvasSize - dw) / 2;
        const dy = (canvasSize - dh) / 2;
        canvasCtx.drawImage(backgroundImage, dx, dy, dw, dh);
    } else {
        canvasCtx.fillStyle = "#0e1733";
        canvasCtx.fillRect(0, 0, canvasSize, canvasSize);
    }

    if (showGrid && gridStep > 0) drawGrid(canvasCtx, gridStep, center, ppi, canvasSize);
    drawPath(canvasCtx, startPose, points, center, ppi);

    overlayCtx.clearRect(0, 0, canvasSize, canvasSize);
    drawStartMarker(overlayCtx, startPose, center, ppi, placeStart, robot);
    drawWaypoints(overlayCtx, points, center, ppi, robot);
    drawPreview(overlayCtx, {
        preview,
        startPose,
        points,
        center,
        ppi,
        robot,
        placeStart,
        headingMode,
        endHeading,
        shapeType,
        bezierTemp,
        arcTemp,
    });
    drawPlayback(overlayCtx, {
        playState,
        playDist,
        waypoints,
        startPose,
        points,
        center,
        ppi,
        robot,
    });
    drawLivePose(overlayCtx, livePose, center, ppi, robot);
};

const drawGrid = (ctx, step, center, ppi, canvasSize) => {
    const spacing = Math.max(0.1, step);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#334155";
    for (let y = -FIELD_SIZE_IN / 2; y <= FIELD_SIZE_IN / 2 + 1e-6; y += spacing) {
        const {cx} = worldToCanvas(0, y, center.x, center.y, ppi);
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, canvasSize);
        ctx.stroke();
    }
    for (let x = -FIELD_SIZE_IN / 2; x <= FIELD_SIZE_IN / 2 + 1e-6; x += spacing) {
        const {cy} = worldToCanvas(x, 0, center.x, center.y, ppi);
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(canvasSize, cy);
        ctx.stroke();
    }
    ctx.restore();
};

const drawPath = (ctx, startPose, points, center, ppi) => {
    if (!points.length) return;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = PATH_COLOR;
    ctx.lineWidth = 3;
    const start = worldToCanvas(num(startPose.x), num(startPose.y), center.x, center.y, ppi);
    ctx.beginPath();
    ctx.moveTo(start.cx, start.cy);
    points.forEach((p) => {
        const c = worldToCanvas(p.x, p.y, center.x, center.y, ppi);
        ctx.lineTo(c.cx, c.cy);
    });
    ctx.stroke();
    ctx.restore();
};

const drawStartMarker = (ctx, startPose, center, ppi, placingStart, robot) => {
    if (placingStart) return;
    const sx = num(startPose.x);
    const sy = num(startPose.y);
    const sh = normDeg(num(startPose.h));
    drawFootprint(ctx, sx, sy, sh, robot.length, robot.width, {
        fill: START_COLOR,
        stroke: "#ffc14b",
        alpha: 0.12,
    }, center, ppi);
    const {cx, cy} = worldToCanvas(sx, sy, center.x, center.y, ppi);
    drawMarker(ctx, cx, cy, START_COLOR, sh);
};

const drawMarker = (ctx, cx, cy, color, heading) => {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
    const arrow = headingVector(heading, 20);
    drawArrow(ctx, cx, cy, cx + arrow.dx, cy + arrow.dy, color);
    ctx.restore();
};

const drawWaypoints = (ctx, points, center, ppi, robot) => {
    ctx.save();
    points.forEach((point, index) => {
        const heading = num(point.h ?? 0);
        const {cx, cy} = worldToCanvas(point.x, point.y, center.x, center.y, ppi);
        ctx.fillStyle = index === points.length - 1 ? LAST_POINT_COLOR : WAYPOINT_COLOR;
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();
        const arrow = headingVector(heading, 18);
        drawArrow(ctx, cx, cy, cx + arrow.dx, cy + arrow.dy, FOOTPRINT_FILL);
    });
    if (points.length) {
        const last = points[points.length - 1];
        drawFootprint(ctx, last.x, last.y, num(last.h ?? 0), robot.length, robot.width, {
            fill: "#7aa2ff",
            stroke: "#7aa2ff",
            alpha: 0.12,
        }, center, ppi);
    }
    ctx.restore();
};

const drawPreview = (ctx, {
    preview,
    startPose,
    points,
    center,
    ppi,
    robot,
    placeStart,
    headingMode,
    endHeading,
    shapeType,
    bezierTemp,
    arcTemp,
}) => {
    const sx = num(startPose.x);
    const sy = num(startPose.y);
    const sh = num(startPose.h);
    const anchor = points.length ? points[points.length - 1] : {x: sx, y: sy, h: sh};

    if (placeStart && preview) {
        const heading = num(preview.h ?? sh);
        drawFootprint(ctx, preview.x, preview.y, heading, robot.length, robot.width, {
            fill: START_COLOR,
            stroke: "#ffc14b",
            alpha: 0.16,
        }, center, ppi);
        drawPreviewMarker(ctx, preview, center, ppi, START_COLOR, heading);
        return;
    }

    if (shapeType === "bezier" && bezierTemp) {
        const control = bezierTemp.control;
        const ctrlCanvas = worldToCanvas(control.x, control.y, center.x, center.y, ppi);
        ctx.save();
        ctx.fillStyle = "#bae6fd";
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(ctrlCanvas.cx, ctrlCanvas.cy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();

        if (!preview) return;

        drawCurvedPreview(ctx, {
            samples: sampleQuadraticBezier(anchor, bezierTemp.control, {x: preview.x, y: preview.y}),
            anchor,
            end: preview,
            center,
            ppi,
            robot,
            headingMode,
            endHeading,
        });
        return;
    }

    if (shapeType === "arc" && arcTemp) {
        const midpoint = arcTemp.mid;
        const midCanvas = worldToCanvas(midpoint.x, midpoint.y, center.x, center.y, ppi);
        ctx.save();
        ctx.fillStyle = "#bae6fd";
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(midCanvas.cx, midCanvas.cy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();

        if (!preview) return;

        drawCurvedPreview(ctx, {
            samples: sampleCircularArcThrough(anchor, arcTemp.mid, {x: preview.x, y: preview.y}),
            anchor,
            end: preview,
            center,
            ppi,
            robot,
            headingMode,
            endHeading,
        });
        return;
    }

    if (!preview) return;

    drawStraightPreview(ctx, anchor, preview, center, ppi, robot);
};

const drawPreviewMarker = (ctx, preview, center, ppi, color, heading) => {
    const pos = worldToCanvas(preview.x, preview.y, center.x, center.y, ppi);
    const arrow = headingVector(heading, 22);
    ctx.save();
    drawArrow(ctx, pos.cx, pos.cy, pos.cx + arrow.dx, pos.cy + arrow.dy, color);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pos.cx, pos.cy, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
};

const drawCurvedPreview = (ctx, {samples, anchor, end, center, ppi, robot, headingMode, endHeading}) => {
    if (!samples?.length) return;
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    const start = worldToCanvas(anchor.x, anchor.y, center.x, center.y, ppi);
    ctx.beginPath();
    ctx.moveTo(start.cx, start.cy);
    samples.forEach((sample) => {
        const c = worldToCanvas(sample.x, sample.y, center.x, center.y, ppi);
        ctx.lineTo(c.cx, c.cy);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    const last = samples[samples.length - 1];
    const tangent = last?.tangent ?? {dx: end.x - anchor.x, dy: end.y - anchor.y};
    const heading = resolvePreviewHeading(headingMode, tangent, endHeading, anchor);
    drawFootprint(ctx, end.x, end.y, heading, robot.length, robot.width, {
        fill: PREVIEW_FILL,
        stroke: PREVIEW_FILL,
        alpha: 0.1,
    }, center, ppi);
    const pos = worldToCanvas(end.x, end.y, center.x, center.y, ppi);
    const arrow = headingVector(heading, 18);
    drawArrow(ctx, pos.cx, pos.cy, pos.cx + arrow.dx, pos.cy + arrow.dy, PREVIEW_FILL);
    ctx.restore();
};

const drawStraightPreview = (ctx, anchor, preview, center, ppi, robot) => {
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    const start = worldToCanvas(anchor.x, anchor.y, center.x, center.y, ppi);
    const end = worldToCanvas(preview.x, preview.y, center.x, center.y, ppi);
    ctx.beginPath();
    ctx.moveTo(start.cx, start.cy);
    ctx.lineTo(end.cx, end.cy);
    ctx.stroke();
    ctx.setLineDash([]);
    drawFootprint(ctx, preview.x, preview.y, preview.h, robot.length, robot.width, {
        fill: PREVIEW_FILL,
        stroke: PREVIEW_FILL,
        alpha: 0.1,
    }, center, ppi);
    const arrow = headingVector(preview.h, 18);
    drawArrow(ctx, end.cx, end.cy, end.cx + arrow.dx, end.cy + arrow.dy, PREVIEW_FILL);
    ctx.restore();
};

const drawPlayback = (ctx, {playState, playDist, waypoints, startPose, points, center, ppi, robot}) => {
    if (playState === "stopped" || !points.length) return;
    const progress = getSegmentProgress(waypoints, playDist);
    if (!progress) return;
    const {pos, i, t} = progress;
    const heading = interpolateHeading(i, t, startPose, points);
    drawFootprint(ctx, pos.x, pos.y, heading, robot.length, robot.width, {
        fill: FOOTPRINT_FILL,
        stroke: FOOTPRINT_FILL,
        alpha: 0.16,
    }, center, ppi);
    const canvasPos = worldToCanvas(pos.x, pos.y, center.x, center.y, ppi);
    const arrow = headingVector(heading, 22);
    drawArrow(ctx, canvasPos.cx, canvasPos.cy, canvasPos.cx + arrow.dx, canvasPos.cy + arrow.dy, FOOTPRINT_FILL);
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = FOOTPRINT_FILL;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(canvasPos.cx, canvasPos.cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
};

const drawLivePose = (ctx, livePose, center, ppi, robot) => {
    if (!livePose) return;
    const heading = num(livePose.h ?? 0);
    drawFootprint(ctx, livePose.x, livePose.y, heading, robot.length, robot.width, {
        fill: LIVE_POSE_FILL,
        stroke: LIVE_POSE_FILL,
        alpha: 0.18,
    }, center, ppi);
    const pos = worldToCanvas(livePose.x, livePose.y, center.x, center.y, ppi);
    const arrow = headingVector(heading, 24);
    drawArrow(ctx, pos.cx, pos.cy, pos.cx + arrow.dx, pos.cy + arrow.dy, "#ffbaf0");
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = LIVE_POSE_FILL;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pos.cx, pos.cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
};

const drawFootprint = (ctx, x, y, heading, length, width, {fill, stroke, alpha}, center, ppi) => {
    const hx = length / 2;
    const hy = width / 2;
    const corners = [
        {x: +hx, y: +hy},
        {x: +hx, y: -hy},
        {x: -hx, y: -hy},
        {x: -hx, y: +hy},
    ].map((local) => {
        const world = rotateLocalToWorld(local.x, local.y, heading);
        return worldToCanvas(x + world.x, y + world.y, center.x, center.y, ppi);
    });

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(corners[0].cx, corners[0].cy);
    corners.slice(1).forEach((corner) => ctx.lineTo(corner.cx, corner.cy));
    ctx.closePath();
    ctx.globalAlpha = alpha ?? 0.16;
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();
};

const drawArrow = (ctx, x1, y1, x2, y2, color) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const size = 9;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(angle - Math.PI / 6) * size, y2 - Math.sin(angle - Math.PI / 6) * size);
    ctx.lineTo(x2 - Math.cos(angle + Math.PI / 6) * size, y2 - Math.sin(angle + Math.PI / 6) * size);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
};

const interpolateHeading = (index, t, startPose, points) => {
    const startHeading = index === 0 ? num(startPose.h) : num(points[index - 1]?.h ?? 0);
    const endHeading = num(points[index]?.h ?? 0);
    return normDeg(startHeading + shortestDeltaDeg(startHeading, endHeading) * t);
};

const resolvePreviewHeading = (headingMode, tangent, endHeading, anchor) => {
    const magnitude = Math.hypot(tangent.dx ?? 0, tangent.dy ?? 0);
    if (headingMode === "tangent" && magnitude > 1e-6) return headingFromDelta(tangent.dx, tangent.dy);
    if (headingMode === "orth-left" && magnitude > 1e-6) return perpendicularHeading(tangent.dx, tangent.dy, true);
    if (headingMode === "orth-right" && magnitude > 1e-6) return perpendicularHeading(tangent.dx, tangent.dy, false);
    if (headingMode === "straight") return endHeading;
    return num(anchor?.h ?? 0);
};

export const createCanvasInteraction = ({
    canvasSize,
    center,
    ppi,
    snapStep,
    placeStart,
    startPose,
    setStartPose,
    setPlaceStart,
    computeHeading,
    shapeType,
    appendPoints,
    setPendingBezier,
    bezierTemp,
    setPendingArc,
    arcTemp,
    setPreview,
}) => {
    const handlePointer = (clientX, clientY, rect) => {
        const cx = (clientX - rect.left) * (canvasSize / rect.width);
        const cy = (clientY - rect.top) * (canvasSize / rect.height);
        const world = canvasToWorld(cx, cy, center.x, center.y, ppi);
        const snapped = snapToField(world.x, world.y, snapStep());
        const heading = placeStart ? num(startPose.h) : computeHeading(snapped.x, snapped.y);
        setPreview({x: snapped.x, y: snapped.y, h: heading});
        return {snapped};
    };

    const onMouseMove = (event) => {
        handlePointer(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    };

    const onMouseLeave = () => setPreview(null);

    const onClick = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const {snapped} = handlePointer(event.clientX, event.clientY, rect);
        if (placeStart) {
            setStartPose((prev) => ({...prev, x: snapped.x, y: snapped.y}));
            setPlaceStart(false);
            return;
        }
        if (!bezierTemp && !arcTemp) setPreview(null);
        if (bezierTemp) {
            const anchor = appendPoints.getAnchor();
            const samples = sampleQuadraticBezier(anchor, bezierTemp.control, {x: snapped.x, y: snapped.y});
            appendPoints.fromSamples(samples, "bezier");
            setPendingBezier(null);
            return;
        }
        if (arcTemp) {
            const anchor = appendPoints.getAnchor();
            const samples = sampleCircularArcThrough(anchor, arcTemp.mid, {x: snapped.x, y: snapped.y});
            appendPoints.fromSamples(samples, "arc");
            setPendingArc(null);
            return;
        }
        if (shapeType === "bezier") {
            setPendingBezier({control: {x: snapped.x, y: snapped.y}});
            return;
        }
        if (shapeType === "arc") {
            setPendingArc({mid: {x: snapped.x, y: snapped.y}});
            return;
        }
        appendPoints.single(snapped.x, snapped.y);
    };

    return {onMouseMove, onMouseLeave, onClick};
};

export const createAppendPointsApi = ({
    startPose,
    points,
    setPoints,
    setUndoStack,
    headingMode,
    endHeading,
    resolveHeading,
}) => ({
    getAnchor: () => {
        if (points.length) return points[points.length - 1];
        return {x: num(startPose.x), y: num(startPose.y), h: num(startPose.h)};
    },
    single: (x, y) => {
        const heading = resolveHeading(x, y);
        const point = {x, y, h: heading, showHeading: true};
        setPoints((prev) => [...prev, point]);
        setUndoStack((prev) => [...prev, {type: "point", count: 1}]);
    },
    fromSamples: (samples, shapeType = "curve") => {
        if (!samples?.length) return;
        const appended = [];
        let prev = points.length ? points[points.length - 1] : {x: num(startPose.x), y: num(startPose.y)};
        samples.forEach((sample, index) => {
            const tangent = sample.tangent ?? {dx: sample.x - prev.x, dy: sample.y - prev.y};
            const heading = computeHeadingFromMode(headingMode, tangent, prev, endHeading);
            appended.push({x: sample.x, y: sample.y, h: heading, showHeading: index === samples.length - 1});
            prev = sample;
        });
        setPoints((prev) => [...prev, ...appended]);
        setUndoStack((prev) => [...prev, {type: shapeType, count: appended.length}]);
    },
});

const computeHeadingFromMode = (headingMode, tangent, prev, straightHeading) => {
    const dx = tangent.dx ?? 0;
    const dy = tangent.dy ?? 0;
    if (headingMode === "straight") return straightHeading;
    if (headingMode === "tangent") return headingFromDelta(dx, dy);
    if (headingMode === "orth-left") return perpendicularHeading(dx, dy, true);
    if (headingMode === "orth-right") return perpendicularHeading(dx, dy, false);
    return prev?.h ?? 0;
};

export const buildHeadingResolver = ({headingMode, endHeading, startPose, points}) => (x, y) => {
    if (headingMode === "straight") return endHeading;
    const anchor = points.length ? points[points.length - 1] : {x: num(startPose.x), y: num(startPose.y), h: num(startPose.h)};
    const dx = x - anchor.x;
    const dy = y - anchor.y;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return 0;
    if (headingMode === "tangent") return headingFromDelta(dx, dy);
    if (headingMode === "orth-left") return perpendicularHeading(dx, dy, true);
    if (headingMode === "orth-right") return perpendicularHeading(dx, dy, false);
    return 0;
};

export const createSnapStep = (value) => () => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};
