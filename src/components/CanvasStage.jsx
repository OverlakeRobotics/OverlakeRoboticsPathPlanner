import {useEffect, useMemo, useRef, useState} from "react";
import {FIELD_SIZE_IN} from "../constants/config";
import {
    buildHeadingResolver,
    createAppendPointsApi,
    createCanvasInteraction,
    createSnapStep,
    drawPlannerScene,
    prepareCanvas,
    canvasToWorld,
} from "../utils/canvas";
import PointEditorPopover from "./PointEditorPopover";
import PointHoverPreview from "./PointHoverPreview";
import { headingVector } from "../utils/geometry";

const getDevicePixelRatio = () => (typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio || 1) : 1);

export default function CanvasStage({
                                        canvasSize,
                                        backgroundImage,
                                        showGrid,
                                        gridStep,
                                        startPose,
                                        setStartPose,
                                        points,
                                        setPoints,
                                        setUndoStack,
                                        placeStart,
                                        setPlaceStart,
                                        shapeType,
                                        headingMode,
                                        endHeading,
                                        snapInches,
                                        preview,
                                        setPreview,
                                        bezierTemp,
                                        setBezierTemp,
                                        arcTemp,
                                        setArcTemp,
                                        drawTemp,
                                        setDrawTemp,
                                        robot,
                                        livePose,
                                        playState,
                                        playDist,
                                        waypoints,
                                        onEditorOpen, // optional callback to notify parent when inline editor opens/closes
                                        selectedPointIndex, // index of selected point from point list
                                        onPointSelect, // callback when point is clicked
                                        placePointIndex,
                                        setPlacePointIndex,
                                        scrollSensitivity = 5, // degrees per scroll tick
                                    }) {
    const canvasRef = useRef(null);
    const overlayRef = useRef(null);
    const [dpr, setDpr] = useState(getDevicePixelRatio);
    const drawStateRef = useRef({drawing: false});
    const [cursorPos, setCursorPos] = useState(null);
    const [hoveredPoint, setHoveredPoint] = useState(null);
    const [isSnapping, setIsSnapping] = useState(false);
    const [showHoverPreview, setShowHoverPreview] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartPos, setDragStartPos] = useState(null);
    const hoverTimeoutRef = useRef(null);
    const [isCanvasHovered, setIsCanvasHovered] = useState(false);
    const [previewHeading, setPreviewHeading] = useState(0); // Track heading for placement preview
    const previewHeadingRef = useRef(previewHeading);
    
    // Inline point editor state (moved before useEffect that references it)
    const [pointEditor, setPointEditor] = useState(null);
    // When user presses Escape to cancel placement, we set this ref so the
    // next canvas click is consumed (doesn't place a new point). This prevents
    // an accidental immediate click from adding another point right after
    // cancelling with Escape.
    const placementCancelledRef = useRef(false);

    useEffect(() => {
        const handle = () => setDpr(getDevicePixelRatio());
        window.addEventListener("resize", handle);
        return () => window.removeEventListener("resize", handle);
    }, []);

    useEffect(() => {
        prepareCanvas(canvasRef.current, overlayRef.current, canvasSize, dpr);
    }, [canvasSize, dpr]);

    const ppi = useMemo(() => canvasSize / FIELD_SIZE_IN, [canvasSize]);
    const center = useMemo(() => ({x: canvasSize / 2, y: canvasSize / 2}), [canvasSize]);

    const cx = (fieldY) => center.x - fieldY * ppi;
    const cy = (fieldX) => center.y - fieldX * ppi;

    const getHoveredPointIndex = (canvasX, canvasY) => {
        const threshold = 12;
        if (startPose && !placeStart) {
            const sx = cx(startPose.y);
            const sy = cy(startPose.x);
            const dist = Math.hypot(canvasX - sx, canvasY - sy);
            if (dist <= threshold) return {type: 'start', index: -1};
        }
        for (let i = points.length - 1; i >= 0; i--) {
            const point = points[i];
            const px = cx(point.y);
            const py = cy(point.x);
            const dist = Math.hypot(canvasX - px, canvasY - py);
            if (dist <= threshold) return {type: 'waypoint', index: i};
        }
        return null;
    };

    const resolveHeading = useMemo(
        () => buildHeadingResolver({headingMode, endHeading, startPose, points}),
        [headingMode, endHeading, startPose, points],
    );

    const appendPoints = useMemo(
        () =>
            createAppendPointsApi({
                startPose,
                points,
                setPoints,
                setUndoStack,
                headingMode,
                endHeading,
                resolveHeading,
                onPointPlaced: (pt, idx) => {
                    // position next to the placed point (canvas coordinates)
                    const left = cx(pt.y);
                    const top = cy(pt.x);
                    setPointEditor({point: pt, index: idx, left, top});
                },
            }),
        [startPose, points, setPoints, setUndoStack, headingMode, endHeading, resolveHeading],
    );

    const handlers = useMemo(
        () =>
            createCanvasInteraction({
                canvasSize,
                center,
                ppi,
                snapStep: createSnapStep(snapInches),
                placeStart,
                startPose,
                setStartPose,
                setPlaceStart,
                computeHeading: resolveHeading,
                shapeType,
                appendPoints,
                // provide a way for the interaction layer to read the current preview heading
                // so that placed points honor wheel-set headings
                getPreviewHeading: () => {
                    if (headingMode === 'manual') {
                        return preview && typeof preview.h === 'number' ? preview.h : previewHeadingRef.current;
                    }
                    return undefined;
                },
                setPendingBezier: setBezierTemp,
                bezierTemp,
                setPendingArc: setArcTemp,
                arcTemp,
                setPreview,
                drawStateRef,
                setDrawTemp,
                setCursorPos,
                setIsSnapping,
            }),
        [
            canvasSize,
            center,
            ppi,
            snapInches,
            placeStart,
            startPose,
            setStartPose,
            setPlaceStart,
            resolveHeading,
            shapeType,
            appendPoints,
            setBezierTemp,
            bezierTemp,
            setArcTemp,
            arcTemp,
            setPreview,
            setDrawTemp,
        ],
    );

    const cancelDraw = handlers.cancelDraw;

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                // Priority 1: Cancel point placement mode if active
                if (placePointIndex != null) {
                    setPlacePointIndex && setPlacePointIndex(null);
                    setPreview && setPreview(null);
                    // mark placement cancelled so next click doesn't re-place
                    placementCancelledRef.current = true;
                    return;
                }
                // Priority 2: Close point editor if open
                if (pointEditor) {
                    handlePointEditorCancel();
                    return;
                }
                // Priority 3: Cancel draw mode
                cancelDraw();
                // Clear any preview state so UI visibly exits placement
                setPreview && setPreview(null);
                setPlacePointIndex && setPlacePointIndex(null);
                // mark cancelled so the next click is consumed (prevents accidental placement)
                placementCancelledRef.current = true;
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [cancelDraw, pointEditor, placePointIndex, setPlacePointIndex, setPreview]);

    // Initialize preview heading when entering placement mode
    useEffect(() => {
        if (placePointIndex != null) {
            const initial = points[placePointIndex]?.h ?? startPose?.h ?? 0;
            setPreviewHeading(initial);
            previewHeadingRef.current = initial;
        } else if (preview && preview.h != null) {
            // Also initialize from preview if it has a heading
            setPreviewHeading(preview.h);
            previewHeadingRef.current = preview.h;
        }
    }, [placePointIndex, points, startPose, preview]);

    // Attach native wheel listener with passive:false for reliable preventDefault
    // Behavior:
    // - When actively placing (preview exists or placing a point), wheel overrides preview heading.
    // - When not placing, wheel edits the hovered waypoint, the selected point, or the start pose.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const wheelHandler = (event) => {
            // Normalize delta: positive wheel (down) => increase heading
            const delta = (event.deltaY > 0 ? -1 : 1) * scrollSensitivity;

            // Case A: actively placing a point (preview exists or placePointIndex set)
            if ((placePointIndex != null || preview) && headingMode === 'manual') {
                event.preventDefault();
                const newHeading = ((previewHeadingRef.current + delta) % 360 + 360) % 360;
                previewHeadingRef.current = newHeading;
                setPreviewHeading(newHeading);
                setPreview((p) => (p ? { ...p, h: newHeading } : null));
                return;
            }

            // Case B: adjust existing placed point or start pose when not actively placing
            // Allow scrolling to edit heading of the hovered waypoint or selected point.
            if (!isDragging) {
                // If hovering over a waypoint, edit that waypoint's heading
                if (hoveredPoint && hoveredPoint.type === 'waypoint' && typeof hoveredPoint.index === 'number') {
                    event.preventDefault();
                    const idx = hoveredPoint.index;
                    setPoints((prev) => {
                        if (!prev || idx < 0 || idx >= prev.length) return prev;
                        const next = prev.map((p, i) => (i === idx ? {...p} : p));
                        const cur = Number(next[idx].h ?? 0);
                        const updated = ((cur + delta) % 360 + 360) % 360;
                        next[idx].h = updated;
                        return next;
                    });
                    return;
                }

                // If a point is selected via selectedPointIndex, allow editing it
                if (typeof selectedPointIndex === 'number' && selectedPointIndex >= 0) {
                    event.preventDefault();
                    const idx = selectedPointIndex;
                    setPoints((prev) => {
                        if (!prev || idx < 0 || idx >= prev.length) return prev;
                        const next = prev.map((p, i) => (i === idx ? {...p} : p));
                        const cur = Number(next[idx].h ?? 0);
                        const updated = ((cur + delta) % 360 + 360) % 360;
                        next[idx].h = updated;
                        return next;
                    });
                    return;
                }

                // If hovering over the start pose, allow adjusting start heading
                if (hoveredPoint && hoveredPoint.type === 'start') {
                    event.preventDefault();
                    const cur = Number(startPose?.h ?? 0);
                    const updated = ((cur + delta) % 360 + 360) % 360;
                    setStartPose && setStartPose((prev) => ({...prev, h: updated}));
                    return;
                }
            }
        };

        canvas.addEventListener('wheel', wheelHandler, { passive: false });
        return () => canvas.removeEventListener('wheel', wheelHandler);
    }, [placePointIndex, preview, scrollSensitivity, setPreview, hoveredPoint, isDragging, selectedPointIndex, setPoints, startPose, setStartPose, headingMode]);

    useEffect(() => {
        if (shapeType !== "draw" || placeStart) return;
        const state = drawStateRef.current;
        if (state?.drawing) return;
        const anchor = points.length ? points[points.length - 1] : startPose;
        if (!anchor) return;
        setPreview({x: anchor.x, y: anchor.y, h: anchor.h ?? startPose.h ?? 0});
    }, [shapeType, placeStart, points, startPose, setPreview]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        if (!canvas || !overlay) return;

        const baseCtx = canvas.getContext("2d");
        const overlayCtx = overlay.getContext("2d");

        drawPlannerScene({
            canvasCtx: baseCtx,
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
            hoveredPoint,
            isSnapping,
            snapInches,
            selectedPointIndex, // Pass to draw function to highlight selected point
        });

        if (preview && shapeType !== "draw") {
            const x = Number(preview.x ?? 0);
            const y = Number(preview.y ?? 0);
            const h = Number(preview.h ?? 0);

            const px = cx(y);
            const py = cy(x);

            overlayCtx.save();
            
            // Pulsing effect
            const time = Date.now() / 1000;
            const pulse = 0.15 * Math.sin(time * 3) + 0.85;
            const radius = 5 * pulse;
            
            // Outer glow
            overlayCtx.shadowBlur = 8;
            overlayCtx.shadowColor = "rgba(255, 255, 255, 0.5)";
            
            // Main dot
            overlayCtx.beginPath();
            overlayCtx.arc(px, py, radius, 0, Math.PI * 2);
            overlayCtx.fillStyle = "#ffffff";
            overlayCtx.fill();
            overlayCtx.shadowBlur = 0;
            overlayCtx.lineWidth = 2;
            overlayCtx.strokeStyle = "#000000";
            overlayCtx.stroke();
            
            // Heading arrow: draw using the shared headingVector so it matches
            // other canvas footprints and arrows. Use robot.length (if present)
            // to offset the arrow origin forward by half the robot so the arrow
            // appears at the robot's nose.
            const arrowLen = 18;
            const forwardOffset = (robot && robot.length) ? (robot.length * ppi) / 2 : 0;
            const forwardVec = headingVector(h, forwardOffset);
            const arrowVec = headingVector(h, arrowLen);
            const startX = px + forwardVec.dx;
            const startY = py + forwardVec.dy;
            const arrowX = startX + arrowVec.dx;
            const arrowY = startY + arrowVec.dy;

            overlayCtx.strokeStyle = "#ffffff";
            overlayCtx.lineWidth = 2;
            overlayCtx.beginPath();
            overlayCtx.moveTo(startX, startY);
            overlayCtx.lineTo(arrowX, arrowY);
            overlayCtx.stroke();
            
            // Arrowhead
            const headSize = 6;
            overlayCtx.fillStyle = "#ffffff";
            overlayCtx.beginPath();
            overlayCtx.moveTo(arrowX, arrowY);
            // construct arrowhead from the arrowVec direction
            const angleNorm = Math.hypot(arrowVec.dx, arrowVec.dy) || 1;
            const ux = arrowVec.dx / angleNorm;
            const uy = arrowVec.dy / angleNorm;
            // rotate +-30deg for head points
            const cos30 = Math.cos(Math.PI / 6);
            const sin30 = Math.sin(Math.PI / 6);
            const hx1x = - (ux * cos30 - uy * sin30) * headSize + arrowX;
            const hx1y = - (ux * sin30 + uy * cos30) * headSize + arrowY;
            const hx2x = - (ux * cos30 + uy * sin30) * headSize + arrowX;
            const hx2y = - (-ux * sin30 + uy * cos30) * headSize + arrowY;
            overlayCtx.lineTo(hx1x, hx1y);
            overlayCtx.lineTo(hx2x, hx2y);
            overlayCtx.closePath();
            overlayCtx.fill();

            // Draw small degree label near the arrow tip (offset perpendicular a bit)
            try {
                const deg = Math.round(h || 0);
                // perpendicular offset so text doesn't overlap the arrow line; push further out
                const perpDist = 12;
                const norm = Math.hypot(arrowVec.dx, arrowVec.dy) || 1;
                // perp vector (normalized): (-dy, dx)
                const perpX = (-arrowVec.dy / norm) * perpDist;
                const perpY = (arrowVec.dx / norm) * perpDist;
                const textX = arrowX + perpX;
                const textY = arrowY + perpY + 16;

                // background pill for readability (bigger padding + darker background)
                const paddingX = 8;
                const paddingY = 6;
                overlayCtx.font = '600 13px ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Segoe UI Mono", monospace';
                overlayCtx.textAlign = 'center';
                overlayCtx.textBaseline = 'middle';
                const text = `${deg}°`;
                const metrics = overlayCtx.measureText(text);
                const textW = metrics.width;
                const rectW = textW + paddingX * 2;
                const rectH = 16 + paddingY;

                overlayCtx.beginPath();
                overlayCtx.fillStyle = 'rgba(15,23,42,0.95)';
                // subtle shadow for lift
                overlayCtx.shadowBlur = 8;
                overlayCtx.shadowColor = 'rgba(0,0,0,0.45)';
                if (typeof overlayCtx.roundRect === 'function') {
                    overlayCtx.roundRect(textX - rectW / 2, textY - rectH / 2, rectW, rectH, 6);
                    overlayCtx.fill();
                } else {
                    overlayCtx.fillRect(textX - rectW / 2, textY - rectH / 2, rectW, rectH);
                }
                // remove shadow for text outline
                overlayCtx.shadowBlur = 0;

                // subtle border
                overlayCtx.strokeStyle = 'rgba(255,255,255,0.06)';
                overlayCtx.lineWidth = 1;
                overlayCtx.strokeRect(textX - rectW / 2, textY - rectH / 2, rectW, rectH);

                // outline then fill text for crispness
                overlayCtx.lineWidth = 2;
                overlayCtx.strokeStyle = 'rgba(0,0,0,0.7)';
                overlayCtx.strokeText(text, textX, textY);
                overlayCtx.fillStyle = '#60a5fa';
                overlayCtx.fillText(text, textX, textY);
            } catch (err) {
                // ignore if any canvas API isn't supported
            }

            overlayCtx.restore();
        }
    }, [
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
        hoveredPoint,
        isSnapping,
        selectedPointIndex,
    ]);

    const handleMouseMove = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const canvasX = (event.clientX - rect.left) * (canvasSize / rect.width);
        const canvasY = (event.clientY - rect.top) * (canvasSize / rect.height);
        
        const worldPos = canvasToWorld(canvasX, canvasY, center.x, center.y, ppi);
        setCursorPos({x: worldPos.x, y: worldPos.y});
        
        const hovered = getHoveredPointIndex(canvasX, canvasY);
        setHoveredPoint(hovered);
        
        // If we're in 'place point' mode, show a placement preview at cursor
        if (placePointIndex != null) {
            setPreview({x: worldPos.x, y: worldPos.y, h: previewHeadingRef.current});
        }

        // Show hover preview after a short delay
        if (hovered && !pointEditor && !isDragging) {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = setTimeout(() => {
                setShowHoverPreview(true);
            }, 300);
        } else {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            setShowHoverPreview(false);
        }

        // Handle dragging
        if (isDragging && dragStartPos && hoveredPoint) {
            const dx = worldPos.x - dragStartPos.worldX;
            const dy = worldPos.y - dragStartPos.worldY;
            
            if (hoveredPoint.type === 'start') {
                setStartPose(prev => ({
                    ...prev,
                    x: dragStartPos.startX + dx,
                    y: dragStartPos.startY + dy,
                }));
            } else if (hoveredPoint.type === 'waypoint') {
                setPoints(prev => prev.map((p, i) =>
                    i === hoveredPoint.index
                        ? { ...p, x: dragStartPos.startX + dx, y: dragStartPos.startY + dy }
                        : p
                ));
                // Update point editor if open
                if (pointEditor && pointEditor.index === hoveredPoint.index) {
                    const updatedPoint = points[hoveredPoint.index];
                    setPointEditor(prev => ({
                        ...prev,
                        point: { ...updatedPoint, x: dragStartPos.startX + dx, y: dragStartPos.startY + dy }
                    }));
                }
            }
        }
    };
    
    const handleMouseLeave = () => {
        setCursorPos(null);
        setHoveredPoint(null);
        setShowHoverPreview(false);
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };

    const handlePointClick = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const canvasX = (event.clientX - rect.left) * (canvasSize / rect.width);
        const canvasY = (event.clientY - rect.top) * (canvasSize / rect.height);
        
        const hovered = getHoveredPointIndex(canvasX, canvasY);
        
        // If clicking on a point, open editor and select it
        if (hovered) {
            if (hovered.type === 'waypoint') {
                const point = points[hovered.index];
                const left = cx(point.y);
                const top = cy(point.x);
                setPointEditor({
                    point,
                    index: hovered.index,
                    left,
                    top,
                    prevPoints: [...points], // Store for cancel
                });
                setShowHoverPreview(false);
                if (typeof onPointSelect === 'function') onPointSelect(hovered.index);
                if (typeof onEditorOpen === 'function') onEditorOpen(true);
            } else if (hovered.type === 'start') {
                // Open editor for start pose
                const point = startPose;
                const left = cx(point.y);
                const top = cy(point.x);
                setPointEditor({
                    point,
                    index: -1,
                    left,
                    top,
                    prevStartPose: startPose ? { ...startPose } : null,
                });
                setShowHoverPreview(false);
                if (typeof onEditorOpen === 'function') onEditorOpen(true);
            }
        }
    };

    const handlePointerDown = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const canvasX = (event.clientX - rect.left) * (canvasSize / rect.width);
        const canvasY = (event.clientY - rect.top) * (canvasSize / rect.height);
        
        const hovered = getHoveredPointIndex(canvasX, canvasY);
        const worldPos = canvasToWorld(canvasX, canvasY, center.x, center.y, ppi);
        
        // Start dragging if on a point and Shift is held
        if (hovered && event.shiftKey) {
            event.preventDefault();
            setIsDragging(true);
            setShowHoverPreview(false);
            
            if (hovered.type === 'start') {
                setDragStartPos({
                    worldX: worldPos.x,
                    worldY: worldPos.y,
                    startX: startPose.x,
                    startY: startPose.y,
                });
            } else if (hovered.type === 'waypoint') {
                const point = points[hovered.index];
                setDragStartPos({
                    worldX: worldPos.x,
                    worldY: worldPos.y,
                    startX: point.x,
                    startY: point.y,
                });
            }
        } else {
            // Normal pointer down handling
            handlers.onPointerDown(event);
        }
    };

    const handlePointerUp = (event) => {
        if (isDragging) {
            setIsDragging(false);
            setDragStartPos(null);
            // Add to undo stack
            setUndoStack(prev => [...prev, { type: 'move', points: [...points], startPose: { ...startPose } }]);
        } else {
            handlers.onPointerUp(event);
        }
    };

    const handlePointEditorSave = (updatedPoint, idx) => {
        // already optimistically persisted via onChange; ensure final merge and close
        // Normalize tags to a consistent shape before saving
        const normalizeTag = (t) => {
            if (!t) return null;
            const id = t.id ?? t.name ?? t.label ?? String(t);
            const name = t.name ?? t.label ?? id;
            const params = t.params && typeof t.params === 'object' ? {...t.params} : {};
            const value = Number(params.value ?? t.value ?? 0) || 0;
            return { id, name, params, value };
        };

        const normalized = {...updatedPoint};
        if (Array.isArray(updatedPoint.tags)) {
            normalized.tags = updatedPoint.tags.map((t) => normalizeTag(t)).filter(Boolean);
        }

        if (idx === -1) {
            // saving start pose
            setStartPose && setStartPose((prev) => ({...prev, ...normalized}));
        } else {
            setPoints((prev) => prev.map((p, i) => (i === idx ? {...p, ...normalized} : p)));
        }
        setPointEditor(null);
        if (typeof onEditorOpen === "function") onEditorOpen(false);
    };

    const handlePointEditorChange = (partial) => {
        // optimistic update while editing
        if (!pointEditor) return;
        const idx = pointEditor.index;
        // If tags are present in the partial update, normalize them for consistency
        const normalizeTag = (t) => {
            if (!t) return null;
            const id = t.id ?? t.name ?? t.label ?? String(t);
            const name = t.name ?? t.label ?? id;
            const params = t.params && typeof t.params === 'object' ? {...t.params} : {};
            const value = Number(params.value ?? t.value ?? 0) || 0;
            return { id, name, params, value };
        };

        const normalizedPartial = {...partial};
        if (Array.isArray(partial.tags)) {
            normalizedPartial.tags = partial.tags.map((t) => normalizeTag(t)).filter(Boolean);
        }

        if (idx === -1) {
            // editing start pose
            setStartPose && setStartPose((prev) => ({...prev, ...normalizedPartial}));
            setPointEditor((prev) => (prev ? {...prev, point: {...prev.point, ...normalizedPartial}} : prev));
        } else {
            setPoints((prev) => prev.map((p, i) => (i === idx ? {...p, ...normalizedPartial} : p)));
            setPointEditor((prev) => (prev ? {...prev, point: {...prev.point, ...normalizedPartial}} : prev));
        }
    };

    const handlePointEditorCancel = () => {
        if (!pointEditor) return;
        // restore previous points array if available, or restore start pose
        if (pointEditor.index === -1) {
            if (pointEditor.prevStartPose) {
                setStartPose && setStartPose(pointEditor.prevStartPose);
            }
        } else if (pointEditor.prevPoints && Array.isArray(pointEditor.prevPoints)) {
            setPoints(pointEditor.prevPoints);
            // roll back undo stack: remove last undo entry if it was for the appended point
            setUndoStack((prev) => (prev.length ? prev.slice(0, -1) : prev));
        } else {
            // fallback: if cancelled and it's the last point, remove it
            setPoints((prev) => {
                if (pointEditor.index === prev.length - 1) return prev.slice(0, -1);
                return prev;
            });
            setUndoStack((prev) => (prev.length ? prev.slice(0, -1) : prev));
        }
        setPointEditor(null);
        if (typeof onEditorOpen === "function") onEditorOpen(false);
    };

    const showEmptyState = points.length === 0 && !placeStart && !preview;

    return (
        <div className="canvas-frame" role="application" aria-label="Path planning canvas">
            <div 
                className="canvas-stack" 
                style={{
                    width: `${canvasSize}px`, 
                    height: `${canvasSize}px`,
                }}
                onMouseEnter={() => setIsCanvasHovered(true)}
                onMouseLeave={() => setIsCanvasHovered(false)}
            >
                <canvas
                    ref={canvasRef}
                    width={canvasSize}
                    height={canvasSize}
                    style={{
                        cursor: shapeType === "draw" && !placeStart ? "none" : undefined,
                        touchAction: "none",
                        opacity: 1,
                    }}
                    role="img"
                    aria-label={`Path planning canvas. Current mode: ${shapeType}. ${points.length} waypoints placed. ${placeStart ? 'Placing start position.' : ''}`}
                    onPointerDown={handlePointerDown}
                    onPointerUp={handlePointerUp}
                    onPointerMove={(e) => {
                        if (!isDragging) {
                            // If placement was cancelled via Escape, block the interaction
                            // layer from re-creating the preview until we've consumed
                            // the next click (placementCancelledRef handles that).
                            if (!placementCancelledRef.current) handlers.onPointerMove(e);
                        }
                        handleMouseMove(e);
                    }}
                    onPointerLeave={(e) => {
                        handlers.onPointerLeave(e);
                        handleMouseLeave();
                    }}
                    onPointerCancel={handlers.onPointerCancel}
                    onClick={(e) => {
                        if (!isDragging) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const canvasX = (e.clientX - rect.left) * (canvasSize / rect.width);
                            const canvasY = (e.clientY - rect.top) * (canvasSize / rect.height);
                            const hoveredAtClick = getHoveredPointIndex(canvasX, canvasY);

                            // If clicking on a point: normally open its editor, but when
                            // any placement mode is active (either placing a specific index
                            // or there is an active preview) we should allow placing on
                            // top of existing points instead of opening the editor. Only
                            // open the editor when not placing OR when placement was
                            // explicitly cancelled via Escape.
                            if (hoveredAtClick) {
                                const isPlacingActive = placePointIndex != null || !!preview;
                                if (!isPlacingActive || placementCancelledRef.current) {
                                    handlePointClick(e);
                                    return;
                                }
                                // else: placement active and not cancelled -> don't open editor
                            }

                            // If the user recently hit Escape to cancel placement, consume
                            // this click (we already handled point clicks above so it's safe to return here).
                            if (placementCancelledRef.current) {
                                placementCancelledRef.current = false;
                                // ensure preview is cleared
                                setPreview && setPreview(null);
                                setPlacePointIndex && setPlacePointIndex(null);
                                return;
                            }

                            // If we're placing a specific point, capture this click and set its coordinates
                            if (placePointIndex != null) {
                                const worldPos = canvasToWorld(canvasX, canvasY, center.x, center.y, ppi);

                                // Not clicking on an existing waypoint (we would have handled that earlier): commit placement to the target index
                                setPoints((prev) => {
                                    const next = [...prev];
                                    const headingToUse = (preview && typeof preview.h === 'number') ? preview.h : previewHeadingRef.current;
                                    next[placePointIndex] = { ...(next[placePointIndex] ?? {}), x: worldPos.x, y: worldPos.y, h: headingToUse };
                                    return next;
                                });
                                // push undo entry
                                setUndoStack((prev) => [...prev, { type: 'move', points: [...points], startPose: { ...startPose } }]);
                                // clear placement mode and preview
                                setPlacePointIndex && setPlacePointIndex(null);
                                setPreview && setPreview(null);
                                return;
                            }

                            handlers.onClick(e);
                        }
                    }}
                />
                <canvas ref={overlayRef} className="overlay" width={canvasSize} height={canvasSize} />
                
                {pointEditor && (
                    <PointEditorPopover
                        point={pointEditor.point}
                        index={pointEditor.index}
                        position={{left: pointEditor.left, top: pointEditor.top}}
                        onSave={(updated, idx) => handlePointEditorSave(updated, idx)}
                        onCancel={() => handlePointEditorCancel()}
                        onChange={(partial) => handlePointEditorChange(partial)}
                    />
                )}

                {/* Hover preview tooltip */}
                {showHoverPreview && hoveredPoint && !pointEditor && (
                    <PointHoverPreview
                        point={hoveredPoint.type === 'start' ? startPose : points[hoveredPoint.index]}
                        index={hoveredPoint.index}
                        position={{
                            left: hoveredPoint.type === 'start'
                                ? cx(startPose.y)
                                : cx(points[hoveredPoint.index].y),
                            top: hoveredPoint.type === 'start'
                                ? cy(startPose.x)
                                : cy(points[hoveredPoint.index].x),
                        }}
                        type={hoveredPoint.type}
                    />
                )}
                
                {/* NOTE: Top-center heading indicator removed. We now draw a compact
                    heading arrow and numeric label directly on the overlay canvas
                    next to the preview point so the UI stays contextually near the
                    placement cursor. */}
                
                {/* Coordinate display */}
                {cursorPos && !placeStart && (
                    <div
                        style={{
                            position: "absolute",
                            bottom: "12px",
                            right: "12px",
                            backgroundColor: "rgba(15, 23, 42, 0.9)",
                            color: "#e2e8f0",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            fontSize: "13px",
                            fontFamily: '"Inter", "Segoe UI", sans-serif',
                            fontWeight: "500",
                            pointerEvents: "none",
                            userSelect: "none",
                            border: "1px solid rgba(148, 163, 184, 0.2)",
                            backdropFilter: "blur(8px)",
                            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.3)",
                        }}
                    >
                        X: {cursorPos.x.toFixed(1)}" &nbsp; Y: {cursorPos.y.toFixed(1)}"
                    </div>
                )}
            </div>
        </div>
    );
}
