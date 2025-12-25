import {
    MIN_DRAW_SAMPLE_SPACING_IN,
    MIN_DRAW_SEGMENT_LEN_IN,
    DRAW_SIMPLIFY_TOLERANCE_IN,
    DRAW_RAW_COLOR,
    DRAW_FIT_COLOR,
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
    pathPoints,
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
    displayPoints,
    selectedPointIndices,
    editMode,
    palette,
    fieldSize,
    zoom,
    marquee,
    highlightSelection,
    segments,
}) => {
    if (!canvasCtx || !overlayCtx) return;

    canvasCtx.clearRect(0, 0, canvasSize, canvasSize);
    if (backgroundImage && backgroundImage.complete) {
        const scale = Math.min(canvasSize / backgroundImage.width, canvasSize / backgroundImage.height) * (zoom || 1);
        const dw = backgroundImage.width * scale;
        const dh = backgroundImage.height * scale;
        const dx = center.x - dw / 2;
        const dy = center.y - dh / 2;
        canvasCtx.drawImage(backgroundImage, dx, dy, dw, dh);
    } else {
        canvasCtx.fillStyle = "#0e1733";
        canvasCtx.fillRect(0, 0, canvasSize, canvasSize);
    }

    if (showGrid && gridStep > 0) drawGrid(canvasCtx, gridStep, center, ppi, canvasSize, fieldSize);
    drawPath(canvasCtx, startPose, pathPoints, center, ppi, palette, placeStart);

    overlayCtx.clearRect(0, 0, canvasSize, canvasSize);
    drawStartMarker(overlayCtx, startPose, center, ppi, placeStart, robot, palette);
    drawWaypoints(overlayCtx, displayPoints, center, ppi, robot, selectedPointIndices, editMode, palette, highlightSelection);
    drawSegmentControls(overlayCtx, {
        segments,
        startPose,
        center,
        ppi,
        editMode,
        selectedPointIndices,
        highlightSelection,
    });
    drawPreview(overlayCtx, {
        preview,
        startPose,
        points: displayPoints,
        center,
        ppi,
        robot,
        placeStart,
        headingMode,
        endHeading,
        shapeType,
        bezierTemp,
        arcTemp,
        palette,
    });
    drawDrawOverlay(overlayCtx, {drawTemp, center, ppi});
    drawPlayback(overlayCtx, {
        playState,
        playDist,
        waypoints,
        startPose,
        points: pathPoints,
        center,
        ppi,
        robot,
        palette,
    });
    drawLivePose(overlayCtx, livePose, center, ppi, robot, palette);
    
    // Draw marquee selection box
    if (marquee) {
        drawMarquee(overlayCtx, marquee);
    }
};

const drawMarquee = (ctx, marquee) => {
    ctx.save();
    ctx.strokeStyle = "#5cd2ff";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.fillStyle = "rgba(92, 210, 255, 0.1)";
    
    const x = Math.min(marquee.startX, marquee.endX);
    const y = Math.min(marquee.startY, marquee.endY);
    const w = Math.abs(marquee.endX - marquee.startX);
    const h = Math.abs(marquee.endY - marquee.startY);
    
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.restore();
};

const drawGrid = (ctx, step, center, ppi, canvasSize, fieldSize) => {
    const spacing = Math.max(0.1, step);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#334155";
    for (let y = -fieldSize / 2; y <= fieldSize / 2 + 1e-6; y += spacing) {
        const {cx} = worldToCanvas(0, y, center.x, center.y, ppi);
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, canvasSize);
        ctx.stroke();
    }
    for (let x = -fieldSize / 2; x <= fieldSize / 2 + 1e-6; x += spacing) {
        const {cy} = worldToCanvas(x, 0, center.x, center.y, ppi);
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(canvasSize, cy);
        ctx.stroke();
    }
    ctx.restore();
};

const drawPath = (ctx, startPose, points, center, ppi, palette, placeStart) => {
    if (!points.length) return;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = palette.path;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (placeStart) {
        const first = points[0];
        const start = worldToCanvas(first.x, first.y, center.x, center.y, ppi);
        ctx.moveTo(start.cx, start.cy);
        points.slice(1).forEach((p) => {
            const c = worldToCanvas(p.x, p.y, center.x, center.y, ppi);
            ctx.lineTo(c.cx, c.cy);
        });
    } else {
        const start = worldToCanvas(num(startPose.x), num(startPose.y), center.x, center.y, ppi);
        ctx.moveTo(start.cx, start.cy);
        points.forEach((p) => {
            const c = worldToCanvas(p.x, p.y, center.x, center.y, ppi);
            ctx.lineTo(c.cx, c.cy);
        });
    }
    ctx.stroke();
    ctx.restore();
};

const drawStartMarker = (ctx, startPose, center, ppi, placingStart, robot, palette) => {
    if (placingStart) return;
    const sx = num(startPose.x);
    const sy = num(startPose.y);
    const sh = normDeg(num(startPose.h));
    drawFootprint(ctx, sx, sy, sh, robot.length, robot.width, {
        fill: palette.start,
        stroke: "#ffc14b",
        alpha: 0.12,
    }, center, ppi);
    const {cx, cy} = worldToCanvas(sx, sy, center.x, center.y, ppi);
    drawMarker(ctx, cx, cy, palette.start, sh);
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

const drawWaypoints = (ctx, points, center, ppi, robot, selectedPointIndices, editMode, palette, highlightSelection) => {
    ctx.save();
    const selectedSet = new Set(selectedPointIndices || []);
    const showSelection = editMode || highlightSelection;
    
    points.forEach((point, index) => {
        const heading = num(point.h ?? 0);
        const {cx, cy} = worldToCanvas(point.x, point.y, center.x, center.y, ppi);

        // Highlight selected points in edit mode
        const isSelected = showSelection && selectedSet.has(index);

        if (isSelected) {
            // Draw selection ring
            ctx.strokeStyle = "#5cd2ff";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy, 12, 0, Math.PI * 2);
            ctx.stroke();

            // Draw footprint for selected point
            drawFootprint(ctx, point.x, point.y, heading, robot.length, robot.width, {
                fill: "#5cd2ff",
                stroke: "#5cd2ff",
                alpha: 0.12,
            }, center, ppi);
        }

        ctx.fillStyle = isSelected ? "#5cd2ff" : (index === points.length - 1 ? "#ffffff" : palette.waypoint);
        ctx.beginPath();
        ctx.arc(cx, cy, isSelected ? 7 : 5, 0, Math.PI * 2);
        ctx.fill();

        const arrow = headingVector(heading, 18);
        drawArrow(ctx, cx, cy, cx + arrow.dx, cy + arrow.dy, isSelected ? "#5cd2ff" : palette.footprint);
    });
    
    // Always draw footprint for the last point if not already drawn (selected)
    if (points.length) {
        const lastIndex = points.length - 1;
        if (!selectedSet.has(lastIndex)) {
            const last = points[lastIndex];
            drawFootprint(ctx, last.x, last.y, num(last.h ?? 0), robot.length, robot.width, {
                fill: "#7aa2ff",
                stroke: "#7aa2ff",
                alpha: 0.12,
            }, center, ppi);
        }
    }
    ctx.restore();
};

const drawSegmentControls = (ctx, {segments, startPose, center, ppi, editMode, selectedPointIndices, highlightSelection}) => {
    if ((!editMode && !highlightSelection) || !segments?.length) return;
    const selectedSet = new Set(selectedPointIndices || []);
    if (!editMode && selectedSet.size === 0) return;
    let anchor = {x: num(startPose.x), y: num(startPose.y)};
    segments.forEach((segment, index) => {
        const isSelected = selectedSet.has(index);
        if (!editMode && !isSelected) {
            if (segment.end) anchor = segment.end;
            return;
        }
        const control = segment.type === "bezier" ? segment.control : null;
        const end = segment.end;
        if (control && end) {
            const anchorCanvas = worldToCanvas(anchor.x, anchor.y, center.x, center.y, ppi);
            const controlCanvas = worldToCanvas(control.x, control.y, center.x, center.y, ppi);
            const endCanvas = worldToCanvas(end.x, end.y, center.x, center.y, ppi);
            ctx.save();
            ctx.strokeStyle = isSelected ? "#5cd2ff" : "rgba(148, 163, 184, 0.7)";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(anchorCanvas.cx, anchorCanvas.cy);
            ctx.lineTo(controlCanvas.cx, controlCanvas.cy);
            ctx.lineTo(endCanvas.cx, endCanvas.cy);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = isSelected ? "#5cd2ff" : "#f8fafc";
            ctx.strokeStyle = "#0b1324";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(controlCanvas.cx, controlCanvas.cy, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
        if (end) anchor = end;
    });
};

const drawPreviewControlLines = (ctx, {anchor, control, end, center, ppi}) => {
    if (!anchor || !control || !end) return;
    const anchorCanvas = worldToCanvas(anchor.x, anchor.y, center.x, center.y, ppi);
    const controlCanvas = worldToCanvas(control.x, control.y, center.x, center.y, ppi);
    const endCanvas = worldToCanvas(end.x, end.y, center.x, center.y, ppi);
    ctx.save();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(anchorCanvas.cx, anchorCanvas.cy);
    ctx.lineTo(controlCanvas.cx, controlCanvas.cy);
    ctx.lineTo(endCanvas.cx, endCanvas.cy);
    ctx.stroke();
    ctx.setLineDash([]);
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
    palette,
}) => {
    const sx = num(startPose.x);
    const sy = num(startPose.y);
    const sh = num(startPose.h);
    const anchor = points.length ? points[points.length - 1] : {x: sx, y: sy, h: sh};

    if (placeStart && preview) {
        const heading = num(preview.h ?? sh);
        if (points.length) {
            drawStartPreviewSegment(ctx, preview, points[0], center, ppi, palette);
        }
        drawFootprint(ctx, preview.x, preview.y, heading, robot.length, robot.width, {
            fill: palette.start,
            stroke: "#ffc14b",
            alpha: 0.16,
        }, center, ppi);
        drawPreviewMarker(ctx, preview, center, ppi, palette.start, heading);
        return;
    }

    if (shapeType === "bezier" && bezierTemp) {
        const control = bezierTemp.control;
        if (preview) {
            drawCurvedPreview(ctx, {
                samples: sampleQuadraticBezier(anchor, bezierTemp.control, {x: preview.x, y: preview.y}),
                anchor,
                end: preview,
                center,
                ppi,
                robot,
                headingMode,
                endHeading,
                palette,
            });
            drawPreviewControlLines(ctx, {anchor, control, end: preview, center, ppi});
        }

        const ctrlCanvas = worldToCanvas(control.x, control.y, center.x, center.y, ppi);
        ctx.save();
        ctx.fillStyle = "#bae6fd";
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(ctrlCanvas.cx, ctrlCanvas.cy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
        return;
    }

        if (shapeType === "arc" && arcTemp) {
            const midpoint = arcTemp.mid;
            if (preview) {
                drawCurvedPreview(ctx, {
                    samples: sampleCircularArcThrough(anchor, arcTemp.mid, {x: preview.x, y: preview.y}),
                    anchor,
                end: preview,
                center,
                ppi,
                robot,
                headingMode,
                    endHeading,
                    palette,
                });
            }

            const midCanvas = worldToCanvas(midpoint.x, midpoint.y, center.x, center.y, ppi);
            ctx.save();
        ctx.fillStyle = "#bae6fd";
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(midCanvas.cx, midCanvas.cy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
        return;
    }

    if (!preview) return;

    drawStraightPreview(ctx, anchor, preview, center, ppi, robot, palette);
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

const drawStartPreviewSegment = (ctx, preview, firstPoint, center, ppi, palette) => {
    if (!firstPoint) return;
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = palette.preview ?? "#94a3b8";
    ctx.lineWidth = 2;
    const start = worldToCanvas(preview.x, preview.y, center.x, center.y, ppi);
    const end = worldToCanvas(firstPoint.x, firstPoint.y, center.x, center.y, ppi);
    ctx.beginPath();
    ctx.moveTo(start.cx, start.cy);
    ctx.lineTo(end.cx, end.cy);
    ctx.stroke();
    ctx.restore();
};

const drawCurvedPreview = (ctx, {samples, anchor, end, center, ppi, robot, headingMode, endHeading, palette}) => {
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
        fill: palette.preview,
        stroke: palette.preview,
        alpha: 0.1,
    }, center, ppi);
    const pos = worldToCanvas(end.x, end.y, center.x, center.y, ppi);
    const arrow = headingVector(heading, 18);
    drawArrow(ctx, pos.cx, pos.cy, pos.cx + arrow.dx, pos.cy + arrow.dy, palette.preview);
    ctx.restore();
};

const drawStraightPreview = (ctx, anchor, preview, center, ppi, robot, palette) => {
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
        fill: palette.preview,
        stroke: palette.preview,
        alpha: 0.1,
    }, center, ppi);
    const arrow = headingVector(preview.h, 18);
    drawArrow(ctx, end.cx, end.cy, end.cx + arrow.dx, end.cy + arrow.dy, palette.preview);
    ctx.restore();
};

const drawDrawOverlay = (ctx, {drawTemp, center, ppi}) => {
    if (!drawTemp) return;
    const {raw, fit, cursorWorld, isDrawing} = drawTemp;
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

const drawPlayback = (ctx, {playState, playDist, waypoints, startPose, points, center, ppi, robot, palette}) => {
    if (playState === "stopped" || !points.length) return;
    const progress = getSegmentProgress(waypoints, playDist);
    if (!progress) return;
    const {pos, i, t} = progress;
    const heading = interpolateHeading(i, t, startPose, points);
    drawFootprint(ctx, pos.x, pos.y, heading, robot.length, robot.width, {
        fill: palette.footprint,
        stroke: palette.footprint,
        alpha: 0.16,
    }, center, ppi);
    const canvasPos = worldToCanvas(pos.x, pos.y, center.x, center.y, ppi);
    const arrow = headingVector(heading, 22);
    drawArrow(ctx, canvasPos.cx, canvasPos.cy, canvasPos.cx + arrow.dx, canvasPos.cy + arrow.dy, palette.footprint);
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = palette.footprint;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(canvasPos.cx, canvasPos.cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
};

const drawLivePose = (ctx, livePose, center, ppi, robot, palette) => {
    if (!livePose) return;
    const heading = num(livePose.h ?? 0);
    drawFootprint(ctx, livePose.x, livePose.y, heading, robot.length, robot.width, {
        fill: palette.livePose,
        stroke: palette.livePose,
        alpha: 0.18,
    }, center, ppi);
    const pos = worldToCanvas(livePose.x, livePose.y, center.x, center.y, ppi);
    const arrow = headingVector(heading, 24);
    drawArrow(ctx, pos.cx, pos.cy, pos.cx + arrow.dx, pos.cy + arrow.dy, "#ffbaf0");
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = palette.livePose;
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

const clampPointToField = (point, fieldSize) => {
    const edge = fieldSize / 2;
    return {
        x: clamp(point.x, -edge, edge),
        y: clamp(point.y, -edge, edge),
    };
};

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
    drawMode,
    editMode,
    points,
    selectedPointIndices,
    setSelectedPointIndices,
    updatePoint,
    updatePoints,
    segments,
    onUpdateSegmentControl,
    onUpdateSegmentMid,
    onBeginEditAction,
    onEndEditAction,
    fieldSize,
    zoom,
    setMarquee,
    marquee,
    robot,
}) => {
    const pointerToWorldRaw = (clientX, clientY, rect) => {
        const cx = (clientX - rect.left) * (canvasSize / rect.width);
        const cy = (clientY - rect.top) * (canvasSize / rect.height);
        return canvasToWorld(cx, cy, center.x, center.y, ppi);
    };

    const pointerToWorld = (clientX, clientY, rect) => {
        const world = pointerToWorldRaw(clientX, clientY, rect);
        return clampPointToField(world, fieldSize);
    };
    
    const pointerToCanvas = (clientX, clientY, rect) => {
        const cx = (clientX - rect.left) * (canvasSize / rect.width);
        const cy = (clientY - rect.top) * (canvasSize / rect.height);
        return {cx, cy};
    };

    const uniqueIndices = (indices) => {
        const seen = new Set();
        const result = [];
        (indices || []).forEach((index) => {
            if (!Number.isFinite(index) || seen.has(index)) return;
            seen.add(index);
            result.push(index);
        });
        return result;
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
                dragSelection: null,
                dragMoved: false,
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
        if (drawStateRef.current.dragSelection !== null && !Array.isArray(drawStateRef.current.dragSelection)) {
            drawStateRef.current.dragSelection = null;
        }
        if (typeof drawStateRef.current.dragMoved !== "boolean") drawStateRef.current.dragMoved = false;
        if (!drawStateRef.current.draggingControl) drawStateRef.current.draggingControl = null;
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

            if (drawMode === "free") {
                state.selectedIndex = undefined;
                setDrawTemp({
                    anchor: state.anchor,
                    raw: rawCopy,
                    candidates,
                    selectedIndex: -1,
                    cursorWorld,
                    isDrawing: state.drawing,
                    fit: null,
                });
                return;
            }

            if (candidates.length) {
                let forcedType = null;
                if (drawMode === "bezier") forcedType = "bezier";
                else if (drawMode === "arc") forcedType = "arc";
                if (forcedType) {
                    const forcedIndex = candidates.findIndex((candidate) => candidate.type === forcedType);
                    if (forcedIndex >= 0) selectedIndex = forcedIndex;
                }
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
        const snapped = snapToField(world.x, world.y, snapStep(), fieldSize);

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
        const world = pointerToWorldRaw(clientX, clientY, rect);
        let point = {x: world.x, y: world.y};
        if (state.anchor && state.startPointer) {
            const dx = world.x - state.startPointer.x;
            const dy = world.y - state.startPointer.y;
            point = {x: state.anchor.x + dx, y: state.anchor.y + dy};
        }
        point = clampPointToField(point, fieldSize);
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
        state.dragSelection = null;
        state.dragMoved = false;
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

    const evaluateDrawSelection = (state, rawCopy, drawModeValue) => {
        const {candidates, bestIndex} = computeDrawCandidates(state.anchor, rawCopy);
        state.candidates = candidates;
        const wantsFreehand = drawModeValue === "free";
        if (!candidates.length) {
            state.selectedIndex = undefined;
            return {selection: null, wantsFreehand, candidates, bestIndex};
        }

        let selectedIndex = typeof state.selectedIndex === "number" ? state.selectedIndex : bestIndex;
        if (Number.isNaN(selectedIndex)) selectedIndex = bestIndex;

        if (!wantsFreehand) {
            let forcedType = null;
            if (drawModeValue === "bezier") forcedType = "bezier";
            else if (drawModeValue === "arc") forcedType = "arc";
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

    const commitDrawSegment = (drawModeValue) => {
        const state = drawStateRef?.current;
        if (!state || !state.anchor || !state.raw || state.raw.length < 2) {
            updateDrawTemp(null);
            resetDrawState();
            return;
        }
        const rawCopy = state.raw.map((p) => ({x: p.x, y: p.y}));
        const {selection, wantsFreehand} = evaluateDrawSelection(state, rawCopy, drawModeValue);
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
            if (appendPoints.bezier) {
                appendPoints.bezier(selection.control, selection.end);
            } else {
                const samples = sampleQuadraticBezier(selection.anchor, selection.control, selection.end);
                appendPoints.fromSamples(samples, "bezier");
            }
            return;
        }
        if (selection.type === "arc") {
            if (appendPoints.arc) {
                appendPoints.arc(selection.mid, selection.end);
            } else {
                const samples = sampleCircularArcThrough(selection.anchor, selection.mid, selection.end);
                appendPoints.fromSamples(samples, "arc");
            }
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
        const startWorld = pointerToWorldRaw(event.clientX, event.clientY, rect);
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
        if (editMode && segments?.length && (onUpdateSegmentControl || onUpdateSegmentMid)) {
            const rect = event.currentTarget.getBoundingClientRect();
            const world = pointerToWorld(event.clientX, event.clientY, rect);
            const clickRadius = 12 / ppi;
            const hitIndex = segments.findIndex((segment) => {
                const target = segment.type === "bezier"
                    ? segment.control
                    : segment.type === "arc"
                        ? segment.mid
                        : null;
                if (!target) return false;
                return Math.hypot(target.x - world.x, target.y - world.y) < clickRadius;
            });
            if (hitIndex >= 0) {
                const segment = segments[hitIndex];
                const type = segment?.type;
                if (type === "bezier" || type === "arc") {
                    const state = ensureDrawState();
                    state.draggingControl = {index: hitIndex, type};
                    state.dragMoved = false;
                    if (setSelectedPointIndices) setSelectedPointIndices([hitIndex]);
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
        }

        // Check for marquee selection in edit mode
        if (editMode && points && setSelectedPointIndices && setMarquee) {
            const rect = event.currentTarget.getBoundingClientRect();
            const world = pointerToWorld(event.clientX, event.clientY, rect);
            const canvasPos = pointerToCanvas(event.clientX, event.clientY, rect);
            const clickRadius = 15 / ppi;
            const currentSelection = Array.isArray(selectedPointIndices) ? selectedPointIndices : [];

            // Find ALL points within click radius (for stacked points)
            const nearbyPoints = [];
            points.forEach((point, index) => {
                const dx = point.x - world.x;
                const dy = point.y - world.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < clickRadius) {
                    nearbyPoints.push({ index, dist, point });
                }
            });
            // Sort by distance
            nearbyPoints.sort((a, b) => a.dist - b.dist);

            // Check if clicked inside any selected point's footprint
            let clickedOnSelectedFootprint = false;
            if (currentSelection.length > 0 && robot) {
                for (const index of currentSelection) {
                    const p = points[index];
                    if (!p) continue;
                    
                    // Check if world point is inside rotated footprint rect
                    const dx = world.x - p.x;
                    const dy = world.y - p.y;
                    const heading = num(p.h ?? 0);
                    const cos = Math.cos(-heading);
                    const sin = Math.sin(-heading);
                    const rx = dx * cos - dy * sin;
                    const ry = dx * sin + dy * cos;
                    
                    if (Math.abs(rx) <= robot.length / 2 && Math.abs(ry) <= robot.width / 2) {
                        clickedOnSelectedFootprint = true;
                        break;
                    }
                }
            }

            // If clicked on empty area (no specific point center clicked)
            if (nearbyPoints.length === 0) {
                if (clickedOnSelectedFootprint) {
                    // Drag selection via footprint
                    const state = ensureDrawState();
                    state.dragging = true;
                    state.dragPointIndex = currentSelection[0]; // Use first selected point as reference
                    state.dragSelection = currentSelection.length ? [...currentSelection] : null;
                    state.dragMoved = false;
                    state.dragStartWorld = snapToField(world.x, world.y, snapStep(), fieldSize);
                    
                    if (typeof event.pointerId === "number") {
                        try {
                            event.currentTarget.setPointerCapture(event.pointerId);
                            state.pointerId = event.pointerId;
                            state.pointerTarget = event.currentTarget;
                        } catch (e) {}
                    }
                    return;
                }

                // Start marquee selection (no shift needed)
                const state = ensureDrawState();
                state.marqueeStart = canvasPos;
                state.isMarquee = true;
                state.marqueeStartX = canvasPos.cx;
                state.marqueeStartY = canvasPos.cy;
                setMarquee({
                    startX: canvasPos.cx,
                    startY: canvasPos.cy,
                    endX: canvasPos.cx,
                    endY: canvasPos.cy
                });
                if (typeof event.pointerId === "number") {
                    try {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        state.pointerId = event.pointerId;
                        state.pointerTarget = event.currentTarget;
                    } catch (e) {}
                }
                return;
            }

            // Multiple stacked points - select all of them
            if (nearbyPoints.length > 1) {
                const state = ensureDrawState();
                state.dragging = true;
                state.dragStartWorld = snapToField(world.x, world.y, snapStep(), fieldSize);
                state.dragMoved = false;
                
                // Select all stacked points unless a prior selection already includes some.
                const stackedIndices = nearbyPoints.map(p => p.index);
                const hasSelectedStacked = stackedIndices.some((index) => currentSelection.includes(index));
                let nextSelection = stackedIndices;

                if (event.ctrlKey || event.metaKey) {
                    // Add to existing selection
                    nextSelection = uniqueIndices([...currentSelection, ...stackedIndices]);
                    setSelectedPointIndices(nextSelection);
                } else if (event.shiftKey && currentSelection.length > 0) {
                    // Range select from last selected to all stacked
                    nextSelection = uniqueIndices([...currentSelection, ...stackedIndices]);
                    setSelectedPointIndices(nextSelection);
                } else if (hasSelectedStacked) {
                    nextSelection = currentSelection;
                } else {
                    // Replace selection with all stacked points
                    nextSelection = stackedIndices;
                    setSelectedPointIndices(nextSelection);
                }

                state.dragPointIndex = stackedIndices.find((index) => nextSelection.includes(index)) ?? stackedIndices[0];
                state.dragSelection = nextSelection.length ? [...nextSelection] : null;
                
                if (typeof event.pointerId === "number") {
                    try {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        state.pointerId = event.pointerId;
                        state.pointerTarget = event.currentTarget;
                    } catch (e) {}
                }
                return;
            }

            // Single point - point dragging
            const closestIndex = nearbyPoints[0].index;
            const state = ensureDrawState();
            state.dragging = true;
            state.dragPointIndex = closestIndex;
            state.dragMoved = false;
            state.dragStartWorld = snapToField(world.x, world.y, snapStep(), fieldSize);
            
            // Handle selection
            let nextSelection = currentSelection;
            if (event.ctrlKey || event.metaKey) {
                // Toggle selection with Ctrl/Cmd click
                if (currentSelection.includes(closestIndex)) {
                    nextSelection = currentSelection.filter(i => i !== closestIndex);
                } else {
                    nextSelection = [...currentSelection, closestIndex];
                }
                setSelectedPointIndices(nextSelection);
            } else if (event.shiftKey && currentSelection.length > 0) {
                // Range selection with Shift click
                const lastSelected = currentSelection[currentSelection.length - 1];
                const start = Math.min(lastSelected, closestIndex);
                const end = Math.max(lastSelected, closestIndex);
                const range = [];
                for (let i = start; i <= end; i++) range.push(i);
                nextSelection = uniqueIndices([...currentSelection, ...range]);
                setSelectedPointIndices(nextSelection);
            } else if (!currentSelection.includes(closestIndex)) {
                // Single selection
                nextSelection = [closestIndex];
                setSelectedPointIndices(nextSelection);
            }
            // If already selected, keep selection for group drag
            state.dragSelection = nextSelection.length ? [...nextSelection] : null;
            
            if (typeof event.pointerId === "number") {
                try {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    state.pointerId = event.pointerId;
                    state.pointerTarget = event.currentTarget;
                } catch (e) {}
            }
            return;
        }

        if (beginDraw(event)) return;
        if (shapeType === "draw") setPreview(null);
    };

    const onPointerMove = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const state = drawStateRef?.current;

        if (state?.draggingControl && editMode) {
            if (!state.dragMoved) {
                onBeginEditAction?.();
                state.dragMoved = true;
            }
            const world = pointerToWorld(event.clientX, event.clientY, rect);
            const snapped = snapToField(world.x, world.y, snapStep(), fieldSize);
            if (state.draggingControl.type === "bezier") {
                onUpdateSegmentControl?.(state.draggingControl.index, {x: snapped.x, y: snapped.y});
            } else if (state.draggingControl.type === "arc") {
                onUpdateSegmentMid?.(state.draggingControl.index, {x: snapped.x, y: snapped.y});
            }
            return;
        }

        // Handle marquee selection drag
        if (state?.isMarquee && setMarquee) {
            const canvasPos = pointerToCanvas(event.clientX, event.clientY, rect);
            setMarquee(prev => prev ? {
                ...prev,
                endX: canvasPos.cx,
                endY: canvasPos.cy
            } : null);
            return;
        }

        // Handle point dragging in edit mode (multi-selection aware)
        if (state?.dragging && state.dragPointIndex !== null) {
            if (!state.dragMoved) {
                onBeginEditAction?.();
                state.dragMoved = true;
            }
            const world = pointerToWorld(event.clientX, event.clientY, rect);
            const snapped = snapToField(world.x, world.y, snapStep(), fieldSize);
            
            // If multiple points selected and dragging one of them, move all
            const dragSelection = Array.isArray(state.dragSelection) ? state.dragSelection : selectedPointIndices;
            if (dragSelection && dragSelection.length > 1 && dragSelection.includes(state.dragPointIndex)) {
                if (state.dragStartWorld && updatePoints) {
                    const deltaX = snapped.x - state.dragStartWorld.x;
                    const deltaY = snapped.y - state.dragStartWorld.y;
                    // Update all selected points
                    updatePoints(dragSelection, deltaX, deltaY);
                    state.dragStartWorld = snapped;
                }
            } else if (updatePoint) {
                updatePoint(state.dragPointIndex, { x: snapped.x, y: snapped.y });
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

        if (state?.draggingControl) {
            if (state.dragMoved) onEndEditAction?.();
            state.draggingControl = null;
            state.dragMoved = false;
            if (state.pointerId !== null && state.pointerTarget) {
                try {
                    state.pointerTarget.releasePointerCapture(state.pointerId);
                } catch (e) {}
            }
            state.pointerId = null;
            state.pointerTarget = null;
            state.ignoreClick = true;
            return;
        }

        // Complete marquee selection
        if (state?.isMarquee && setMarquee && setSelectedPointIndices && points) {
            const canvasPos = pointerToCanvas(event.clientX, event.clientY, rect);
            const startX = state.marqueeStartX;
            const startY = state.marqueeStartY;
            const endX = canvasPos.cx;
            const endY = canvasPos.cy;
            
            // Calculate marquee bounds in world coordinates
            const minCx = Math.min(startX, endX);
            const maxCx = Math.max(startX, endX);
            const minCy = Math.min(startY, endY);
            const maxCy = Math.max(startY, endY);
            
            // Find all points within marquee
            const selected = [];
            points.forEach((point, index) => {
                const pointCanvas = worldToCanvas(point.x, point.y, center.x, center.y, ppi);
                if (pointCanvas.cx >= minCx && pointCanvas.cx <= maxCx &&
                    pointCanvas.cy >= minCy && pointCanvas.cy <= maxCy) {
                    selected.push(index);
                }
            });
            
            // Update selection (shift adds to existing, otherwise replaces)
            if (event.shiftKey && selectedPointIndices?.length) {
                const combined = [...new Set([...selectedPointIndices, ...selected])];
                setSelectedPointIndices(combined.length ? combined : []);
            } else {
                setSelectedPointIndices(selected.length ? selected : []);
            }
            
            // Clear marquee state
            state.isMarquee = false;
            state.marqueeStartX = null;
            state.marqueeStartY = null;
            setMarquee(null);
            
            if (state.pointerId !== null && state.pointerTarget) {
                try {
                    state.pointerTarget.releasePointerCapture(state.pointerId);
                } catch (e) {}
            }
            state.pointerId = null;
            state.pointerTarget = null;
            return;
        }

        // Stop dragging in edit mode
        if (state?.dragging) {
            if (state.dragMoved) onEndEditAction?.();
            state.dragging = false;
            state.dragPointIndex = null;
            state.dragStartWorld = null;
            state.dragMoved = false;
            state.dragSelection = null;
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
                commitDrawSegment(drawMode);
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
        const state = drawStateRef?.current;
        if (state?.dragging || state?.draggingControl) {
            if (state.dragMoved) onEndEditAction?.();
            state.dragging = false;
            state.draggingControl = null;
            state.dragPointIndex = null;
            state.dragStartWorld = null;
            state.dragSelection = null;
            state.dragMoved = false;
            releasePointerCapture(state);
        }
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

        // Edit mode: handled in onPointerDown/onPointerUp, skip here
        if (editMode && points && setSelectedPointIndices) {
            // Selection is handled by pointer events, not click
            return;
        }

        if (placeStart) {
            setStartPose((prev) => ({...prev, x: snapped.x, y: snapped.y}));
            setPlaceStart(false);
            return;
        }
        if (!bezierTemp && !arcTemp && shapeType !== "bezier" && shapeType !== "arc") {
            setPreview(null);
        }
        if (bezierTemp) {
            if (appendPoints.bezier) {
                appendPoints.bezier(bezierTemp.control, {x: snapped.x, y: snapped.y});
            } else {
                const anchor = appendPoints.getAnchor();
                const samples = sampleQuadraticBezier(anchor, bezierTemp.control, {x: snapped.x, y: snapped.y});
                appendPoints.fromSamples(samples, "bezier");
            }
            setPendingBezier(null);
            return;
        }
        if (arcTemp) {
            if (appendPoints.arc) {
                appendPoints.arc(arcTemp.mid, {x: snapped.x, y: snapped.y});
            } else {
                const anchor = appendPoints.getAnchor();
                const samples = sampleCircularArcThrough(anchor, arcTemp.mid, {x: snapped.x, y: snapped.y});
                appendPoints.fromSamples(samples, "arc");
            }
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
