import {
    FIELD_SIZE_IN,
    FIELD_EDGE_IN,
    PATH_COLOR,
    START_COLOR,
    WAYPOINT_COLOR,
    LAST_POINT_COLOR,
    FOOTPRINT_FILL,
    LIVE_POSE_FILL,
    PREVIEW_FILL,
    DRAW_RAW_COLOR,
    DRAW_FIT_COLOR,
    DRAW_LABEL_FILL,
    DRAW_LABEL_STROKE,
    MIN_DRAW_SAMPLE_SPACING_IN,
    MIN_DRAW_SEGMENT_LEN_IN,
    DRAW_SIMPLIFY_TOLERANCE_IN,
} from "../constants/config";
import {headingVector, perpendicularHeading} from "./geometry";
import {canvasToWorld, headingFromDelta, rotateLocalToWorld, snapToField, worldToCanvas} from "./geometry";
import {getSegmentProgress, polylineLength, sampleCircularArcThrough, sampleQuadraticBezier} from "./path";
import {computeDrawCandidates} from "./drawFit";
import {clamp, num, normDeg, shortestDeltaDeg} from "./math";

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
    drawTemp,
    selectedPointIndex,
    editMode,
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
    drawWaypoints(overlayCtx, points, center, ppi, robot, selectedPointIndex, editMode);
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
    drawDrawOverlay(overlayCtx, {drawTemp, center, ppi});
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

const drawWaypoints = (ctx, points, center, ppi, robot, selectedPointIndex, editMode) => {
    ctx.save();
    points.forEach((point, index) => {
        const heading = num(point.h ?? 0);
        const {cx, cy} = worldToCanvas(point.x, point.y, center.x, center.y, ppi);

        // Highlight selected point in edit mode
        const isSelected = editMode && selectedPointIndex === index;

        if (isSelected) {
            // Draw selection ring
            ctx.strokeStyle = "#5cd2ff";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy, 12, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.fillStyle = isSelected ? "#5cd2ff" : (index === points.length - 1 ? LAST_POINT_COLOR : WAYPOINT_COLOR);
        ctx.beginPath();
        ctx.arc(cx, cy, isSelected ? 7 : 5, 0, Math.PI * 2);
        ctx.fill();

        const arrow = headingVector(heading, 18);
        drawArrow(ctx, cx, cy, cx + arrow.dx, cy + arrow.dy, isSelected ? "#5cd2ff" : FOOTPRINT_FILL);
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

const drawDrawOverlay = (ctx, {drawTemp, center, ppi}) => {
    if (!drawTemp) return;
    const {raw, fit, candidates, cursorWorld, isDrawing} = drawTemp;
    if (raw?.length >= 2) {
        ctx.save();
        ctx.strokeStyle = DRAW_RAW_COLOR;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        const first = worldToCanvas(raw[0].x, raw[0].y, center.x, center.y, ppi);
        ctx.beginPath();
        ctx.moveTo(first.cx, first.cy);
        raw.slice(1).forEach((point) => {
            const pos = worldToCanvas(point.x, point.y, center.x, center.y, ppi);
            ctx.lineTo(pos.cx, pos.cy);
        });
        ctx.stroke();
        ctx.restore();
    }

    if (fit) {
        const previewPoints = fit.previewSamples?.length ? fit.previewSamples : [fit.anchor, fit.end];
        if (previewPoints.length >= 2) {
            ctx.save();
            ctx.strokeStyle = DRAW_FIT_COLOR;
            ctx.lineWidth = 3;
            ctx.setLineDash([12, 6]);
            const start = worldToCanvas(previewPoints[0].x, previewPoints[0].y, center.x, center.y, ppi);
            ctx.beginPath();
            ctx.moveTo(start.cx, start.cy);
            previewPoints.slice(1).forEach((point) => {
                const pos = worldToCanvas(point.x, point.y, center.x, center.y, ppi);
                ctx.lineTo(pos.cx, pos.cy);
            });
            ctx.stroke();
            ctx.setLineDash([]);

            const endCanvas = worldToCanvas(fit.end.x, fit.end.y, center.x, center.y, ppi);
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = DRAW_FIT_COLOR;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(endCanvas.cx, endCanvas.cy, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            const label = fit?.label ?? (fit?.type === "bezier" ? "Curve" : fit?.type === "arc" ? "Arc" : "Line");
            ctx.font = "12px/1.2 \"Inter\", \"Segoe UI\", sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.lineWidth = 4;
            ctx.strokeStyle = DRAW_LABEL_STROKE;
            ctx.strokeText(label, endCanvas.cx + 10, endCanvas.cy);
            ctx.fillStyle = DRAW_LABEL_FILL;
            ctx.fillText(label, endCanvas.cx + 10, endCanvas.cy);

            if (candidates?.length) {
                const hint = "Shift=line  Alt=arc  Ctrl=curve  Cmd/Alt+Shift=free";
                ctx.font = "10px/1.4 \"Inter\", \"Segoe UI\", sans-serif";
                ctx.textBaseline = "top";
                const hintY = endCanvas.cy + 10;
                ctx.lineWidth = 3;
                ctx.strokeStyle = DRAW_LABEL_STROKE;
                ctx.strokeText(hint, endCanvas.cx + 10, hintY);
                ctx.fillStyle = DRAW_LABEL_FILL;
                ctx.fillText(hint, endCanvas.cx + 10, hintY);
            }
            ctx.restore();
        }
    }

    if (cursorWorld) drawDrawCursor(ctx, cursorWorld, center, ppi, Boolean(isDrawing));
};

const drawDrawCursor = (ctx, cursorWorld, center, ppi, active) => {
    const pos = worldToCanvas(cursorWorld.x, cursorWorld.y, center.x, center.y, ppi);
    ctx.save();
    ctx.strokeStyle = active ? "#f8fafc" : "#cbd5e1";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pos.cx, pos.cy, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.cx - 12, pos.cy);
    ctx.lineTo(pos.cx + 12, pos.cy);
    ctx.moveTo(pos.cx, pos.cy - 12);
    ctx.lineTo(pos.cx, pos.cy + 12);
    ctx.stroke();
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

const enforceSpacing = (points, minSpacing) => {
    if (!points?.length) return [];
    const result = [points[0]];
    for (let i = 1; i < points.length; i += 1) {
        const curr = points[i];
        const last = result[result.length - 1];
        const dist = Math.hypot(curr.x - last.x, curr.y - last.y);
        if (dist >= minSpacing || i === points.length - 1) {
            result.push(curr);
        }
    }
    return result;
};

const pointToSegmentDistance = (point, start, end) => {
    const dx = (end.x ?? 0) - (start.x ?? 0);
    const dy = (end.y ?? 0) - (start.y ?? 0);
    const denom = Math.hypot(dx, dy);
    if (denom < 1e-9) return Math.hypot((point.x ?? 0) - (start.x ?? 0), (point.y ?? 0) - (start.y ?? 0));
    return Math.abs(dy * (point.x - start.x) - dx * (point.y - start.y)) / denom;
};

const douglasPeuckerSimplify = (points, epsilon) => {
    if (!points || points.length <= 2) return points ? points.slice() : [];
    let maxDist = 0;
    let index = 0;
    const start = points[0];
    const end = points[points.length - 1];
    for (let i = 1; i < points.length - 1; i += 1) {
        const dist = pointToSegmentDistance(points[i], start, end);
        if (dist > maxDist) {
            maxDist = dist;
            index = i;
        }
    }
    if (maxDist > epsilon) {
        const left = douglasPeuckerSimplify(points.slice(0, index + 1), epsilon);
        const right = douglasPeuckerSimplify(points.slice(index), epsilon);
        return [...left.slice(0, -1), ...right];
    }
    return [start, end];
};

const simplifyDrawStroke = (points) => {
    if (!points?.length) return [];
    const spaced = enforceSpacing(points, MIN_DRAW_SAMPLE_SPACING_IN * 0.6);
    if (spaced.length <= 2) return spaced.slice();
    const simplified = douglasPeuckerSimplify(spaced, DRAW_SIMPLIFY_TOLERANCE_IN);
    return simplified.length >= 2 ? simplified : spaced.slice();
};

const clampPointToField = (point) => ({
    x: clamp(point.x, -FIELD_EDGE_IN, FIELD_EDGE_IN),
    y: clamp(point.y, -FIELD_EDGE_IN, FIELD_EDGE_IN),
});

const releasePointerCapture = (state) => {
    if (!state) return;
    if (state.pointerTarget && typeof state.pointerTarget.releasePointerCapture === "function" && state.pointerId != null) {
        try {
            state.pointerTarget.releasePointerCapture(state.pointerId);
        } catch (error) {
            // ignore inability to release capture
        }
    }
    state.pointerTarget = null;
    state.pointerId = null;
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
    drawStateRef,
    setDrawTemp,
    editMode,
    points,
    selectedPointIndex,
    setSelectedPointIndex,
    updatePoint,
}) => {
    const pointerToWorld = (clientX, clientY, rect) => {
        const cx = (clientX - rect.left) * (canvasSize / rect.width);
        const cy = (clientY - rect.top) * (canvasSize / rect.height);
        const world = canvasToWorld(cx, cy, center.x, center.y, ppi);
        return clampPointToField(world);
    };

    const ensureDrawState = () => {
        if (!drawStateRef) return null;
        if (!drawStateRef.current) {
            drawStateRef.current = {
                drawing: false,
                raw: [],
                hasMovement: false,
                startPointer: null,
                cursorWorld: null,
                pointerId: null,
                pointerTarget: null,
                dragging: false,
                dragPointIndex: null,
            };
        }
        if (!drawStateRef.current.raw) drawStateRef.current.raw = [];
        if (typeof drawStateRef.current.hasMovement !== "boolean") drawStateRef.current.hasMovement = false;
        if (!drawStateRef.current.startPointer) drawStateRef.current.startPointer = null;
        if (!Array.isArray(drawStateRef.current.candidates)) drawStateRef.current.candidates = [];
        if (typeof drawStateRef.current.selectedIndex !== "number") drawStateRef.current.selectedIndex = undefined;
        if (!drawStateRef.current.cursorWorld) drawStateRef.current.cursorWorld = null;
        if (typeof drawStateRef.current.pointerId !== "number") drawStateRef.current.pointerId = null;
        if (!drawStateRef.current.pointerTarget) drawStateRef.current.pointerTarget = null;
        if (typeof drawStateRef.current.dragging !== "boolean") drawStateRef.current.dragging = false;
        if (typeof drawStateRef.current.dragPointIndex !== "number") drawStateRef.current.dragPointIndex = null;
        return drawStateRef.current;
    };

    const updateDrawTemp = (state) => {
        if (!setDrawTemp) return;
        if (!state) {
            setDrawTemp(null);
            return;
        }
        const rawCopy = state.raw ? state.raw.map((p) => ({x: p.x, y: p.y})) : [];
        const cursorWorld = state.cursorWorld ? {x: state.cursorWorld.x, y: state.cursorWorld.y} : null;
        if (rawCopy.length >= 2) {
            const {candidates, bestIndex} = computeDrawCandidates(state.anchor, rawCopy);
            state.candidates = candidates;
            let selectedIndex = typeof state.selectedIndex === "number" ? state.selectedIndex : bestIndex;
            if (candidates.length) {
                selectedIndex = clamp(selectedIndex ?? 0, 0, candidates.length - 1);
                state.selectedIndex = selectedIndex;
            } else {
                state.selectedIndex = undefined;
            }
            const fit = candidates.length ? candidates[selectedIndex] ?? null : null;
            setDrawTemp({
                anchor: state.anchor,
                raw: rawCopy,
                candidates,
                selectedIndex: candidates.length ? selectedIndex : -1,
                cursorWorld,
                isDrawing: state.drawing,
                fit,
            });
            return;
        }
        state.candidates = [];
        state.selectedIndex = undefined;
        setDrawTemp({
            anchor: state.anchor,
            raw: rawCopy,
            candidates: [],
            selectedIndex: -1,
            cursorWorld,
            isDrawing: state.drawing,
            fit: null,
        });
    };

    const handlePointer = (clientX, clientY, rect) => {
        const state = drawStateRef?.current;
        if (state?.drawing) return null;
        const world = pointerToWorld(clientX, clientY, rect);
        const snapped = snapToField(world.x, world.y, snapStep());

        // Don't show preview in edit mode
        if (!editMode) {
            if (placeStart) {
                const heading = num(startPose.h);
                setPreview({x: snapped.x, y: snapped.y, h: heading});
            } else if (shapeType !== "draw") {
                const heading = computeHeading(snapped.x, snapped.y);
                setPreview({x: snapped.x, y: snapped.y, h: heading});
            } else {
                const anchor = appendPoints.getAnchor();
                if (anchor) setPreview({x: anchor.x, y: anchor.y, h: num(anchor.h ?? startPose.h)});
                else setPreview(null);
            }
        }
        return {snapped, world};
    };

    const appendDrawPoint = (state, clientX, clientY, rect, force = false) => {
        if (!state) return false;
        const world = pointerToWorld(clientX, clientY, rect);
        let point = {x: world.x, y: world.y};
        if (state.anchor && state.startPointer) {
            const dx = world.x - state.startPointer.x;
            const dy = world.y - state.startPointer.y;
            point = {x: state.anchor.x + dx, y: state.anchor.y + dy};
        }
        point = clampPointToField(point);
        state.cursorWorld = point;
        const raw = state.raw || [];
        if (raw.length) {
            const last = raw[raw.length - 1];
            const dist = Math.hypot(point.x - last.x, point.y - last.y);
            const threshold = force ? MIN_DRAW_SAMPLE_SPACING_IN * 0.25 : MIN_DRAW_SAMPLE_SPACING_IN;
            if (dist < threshold) return false;
        }
        raw.push(point);
        state.raw = raw;
        if (raw.length > 1) state.hasMovement = true;
        return true;
    };

    const resetDrawState = () => {
        const state = ensureDrawState();
        if (!state) return;
        releasePointerCapture(state);
        state.drawing = false;
        state.anchor = null;
        state.raw = [];
        state.hasMovement = false;
        state.startPointer = null;
        state.candidates = [];
        state.selectedIndex = undefined;
        state.cursorWorld = null;
    };

    const appendFreehandStroke = (rawCopy) => {
        if (!rawCopy?.length) return false;
        const simplified = simplifyDrawStroke(rawCopy);
        if (simplified.length < 2) return false;
        if (polylineLength(simplified) <= MIN_DRAW_SEGMENT_LEN_IN) return false;
        const samples = simplified.slice(1).map((point, index) => {
            const prev = simplified[index];
            return {
                x: point.x,
                y: point.y,
                tangent: {dx: point.x - prev.x, dy: point.y - prev.y},
            };
        });
        appendPoints.fromSamples(samples, "draw");
        return true;
    };

    const evaluateDrawSelection = (state, rawCopy, modifiers) => {
        const {candidates, bestIndex} = computeDrawCandidates(state.anchor, rawCopy);
        state.candidates = candidates;
        const wantsFreehand = Boolean(modifiers?.metaKey) || (modifiers?.altKey && modifiers?.shiftKey);
        if (!candidates.length) {
            state.selectedIndex = undefined;
            return {selection: null, wantsFreehand, candidates, bestIndex};
        }

        let selectedIndex = typeof state.selectedIndex === "number" ? state.selectedIndex : bestIndex;
        if (Number.isNaN(selectedIndex)) selectedIndex = bestIndex;

        if (!wantsFreehand) {
            let forcedType = null;
            if (modifiers?.ctrlKey) forcedType = "bezier";
            else if (modifiers?.altKey) forcedType = "arc";
            else if (modifiers?.shiftKey) forcedType = "line";
            if (forcedType) {
                const forcedIndex = candidates.findIndex((candidate) => candidate.type === forcedType);
                if (forcedIndex >= 0) selectedIndex = forcedIndex;
            }
        }

        if (selectedIndex == null || selectedIndex < 0 || selectedIndex >= candidates.length) {
            selectedIndex = bestIndex >= 0 ? bestIndex : 0;
        }
        state.selectedIndex = selectedIndex;

        const selection = wantsFreehand ? null : candidates[selectedIndex];
        return {selection, wantsFreehand, candidates, bestIndex};
    };

    const commitDrawSegment = (modifiers = {}) => {
        const state = drawStateRef?.current;
        if (!state || !state.anchor || !state.raw || state.raw.length < 2) {
            updateDrawTemp(null);
            resetDrawState();
            return;
        }
        const rawCopy = state.raw.map((p) => ({x: p.x, y: p.y}));
        const {selection, wantsFreehand} = evaluateDrawSelection(state, rawCopy, modifiers);
        updateDrawTemp(null);
        resetDrawState();

        if (wantsFreehand || !selection) {
            appendFreehandStroke(rawCopy);
            return;
        }

        if (!(selection.length > MIN_DRAW_SEGMENT_LEN_IN)) {
            if (!appendFreehandStroke(rawCopy)) appendFreehandStroke(selection.previewSamples ?? rawCopy);
            return;
        }

        if (selection.type === "line") {
            appendPoints.single(selection.end.x, selection.end.y);
            return;
        }
        if (selection.type === "bezier") {
            const samples = sampleQuadraticBezier(selection.anchor, selection.control, selection.end);
            appendPoints.fromSamples(samples, "bezier");
            return;
        }
        if (selection.type === "arc") {
            const samples = sampleCircularArcThrough(selection.anchor, selection.mid, selection.end);
            appendPoints.fromSamples(samples, "arc");
            return;
        }

        appendFreehandStroke(rawCopy);
    };

    const beginDraw = (event) => {
        if (shapeType !== "draw" || placeStart) return false;
        if (typeof event.preventDefault === "function") event.preventDefault();
        const state = ensureDrawState();
        if (!state) return false;
        const anchorSource = appendPoints.getAnchor();
        const anchor = {x: anchorSource.x, y: anchorSource.y, h: anchorSource.h};
        state.drawing = true;
        state.anchor = anchor;
        state.raw = [{x: anchor.x, y: anchor.y}];
        state.hasMovement = false;
        state.ignoreClick = false;
        state.candidates = [];
        state.selectedIndex = undefined;
        state.cursorWorld = {x: anchor.x, y: anchor.y};
        const rect = event.currentTarget.getBoundingClientRect();
        const startWorld = pointerToWorld(event.clientX, event.clientY, rect);
        state.startPointer = startWorld;
        if (typeof event.pointerId === "number" && typeof event.currentTarget.setPointerCapture === "function") {
            try {
                event.currentTarget.setPointerCapture(event.pointerId);
                state.pointerId = event.pointerId;
                state.pointerTarget = event.currentTarget;
            } catch (error) {
                state.pointerId = null;
                state.pointerTarget = null;
            }
        }
        setPreview(null);
        updateDrawTemp(state);
        return true;
    };

    const onPointerDown = (event) => {
        // Check for point dragging in edit mode
        if (editMode && points && updatePoint) {
            const rect = event.currentTarget.getBoundingClientRect();
            const world = pointerToWorld(event.clientX, event.clientY, rect);
            const clickRadius = 15 / ppi;

            let closestIndex = -1;
            let closestDist = Infinity;
            points.forEach((point, index) => {
                const dx = point.x - world.x;
                const dy = point.y - world.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < clickRadius && dist < closestDist) {
                    closestDist = dist;
                    closestIndex = index;
                }
            });

            if (closestIndex >= 0) {
                const state = ensureDrawState();
                state.dragging = true;
                state.dragPointIndex = closestIndex;
                setSelectedPointIndex(closestIndex);
                if (typeof event.pointerId === "number") {
                    try {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        state.pointerId = event.pointerId;
                        state.pointerTarget = event.currentTarget;
                    } catch (e) {}
                }
                return;
            }
        }

        if (beginDraw(event)) return;
        if (shapeType === "draw") setPreview(null);
    };

    const onPointerMove = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const state = drawStateRef?.current;

        // Handle point dragging in edit mode
        if (state?.dragging && state.dragPointIndex !== null && updatePoint) {
            const result = handlePointer(event.clientX, event.clientY, rect);
            if (result) {
                updatePoint(state.dragPointIndex, { x: result.snapped.x, y: result.snapped.y });
            }
            return;
        }

        if (state?.drawing) {
            const appended = appendDrawPoint(state, event.clientX, event.clientY, rect, false);
            if (appended || state.cursorWorld) updateDrawTemp(state);
            return;
        }
        handlePointer(event.clientX, event.clientY, rect);
    };

    const onPointerUp = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const state = drawStateRef?.current;

        // Stop dragging in edit mode
        if (state?.dragging) {
            state.dragging = false;
            state.dragPointIndex = null;
            if (state.pointerId !== null && state.pointerTarget) {
                try {
                    state.pointerTarget.releasePointerCapture(state.pointerId);
                } catch (e) {}
            }
            state.pointerId = null;
            state.pointerTarget = null;
            state.ignoreClick = true; // Prevent onClick from firing after drag
            return;
        }

        if (state?.drawing) {
            if (state.hasMovement) {
                appendDrawPoint(state, event.clientX, event.clientY, rect, true);
                updateDrawTemp(state);
                commitDrawSegment({
                    shiftKey: event.shiftKey,
                    altKey: event.altKey,
                    ctrlKey: event.ctrlKey,
                    metaKey: event.metaKey,
                });
            } else {
                updateDrawTemp(null);
                resetDrawState();
            }
            state.ignoreClick = true;
            return;
        }
    };

    const onPointerLeave = () => {
        const state = drawStateRef?.current;
        if (state?.drawing) {
            updateDrawTemp(state);
        } else {
            setPreview(null);
        }
    };

    const cancelDraw = () => {
        const state = drawStateRef?.current;
        if (!state?.drawing) return;
        updateDrawTemp(null);
        resetDrawState();
        state.ignoreClick = true;
        const anchor = appendPoints.getAnchor();
        if (anchor) setPreview({x: anchor.x, y: anchor.y, h: num(anchor.h ?? startPose.h ?? 0)});
    };

    const onPointerCancel = () => {
        cancelDraw();
    };

    const onClick = (event) => {
        const state = drawStateRef?.current;
        if (state?.ignoreClick) {
            state.ignoreClick = false;
            return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const result = handlePointer(event.clientX, event.clientY, rect);
        if (!result) return;
        const {snapped, world} = result;

        // Edit mode: select point
        if (editMode && points && setSelectedPointIndex) {
            const clickRadius = 15 / ppi; // 15 pixels in inches
            let closestIndex = -1;
            let closestDist = Infinity;

            points.forEach((point, index) => {
                const dx = point.x - world.x;
                const dy = point.y - world.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < clickRadius && dist < closestDist) {
                    closestDist = dist;
                    closestIndex = index;
                }
            });

            if (closestIndex >= 0) {
                setSelectedPointIndex(closestIndex);
                return;
            } else {
                setSelectedPointIndex(null);
                return;
            }
        }

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

    return {onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onPointerCancel, onClick, cancelDraw};
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
