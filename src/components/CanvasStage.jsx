import {useEffect, useMemo, useRef, useState, useCallback} from "react";
import {
    buildHeadingResolver,
    createCanvasInteraction,
    createSnapStep,
    drawPlannerScene,
    prepareCanvas,
} from "../utils/canvas";

const getDevicePixelRatio = () => (typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio || 1) : 1);

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;

export default function CanvasStage({
                                        canvasSize,
                                        backgroundImage,
                                        showGrid,
                                        gridStep,
                                        startPose,
                                        setStartPose,
                                        pathPoints,
                                        displayPoints,
                                        segments,
                                        onAddLineSegment,
                                        onAddBezierSegment,
                                        onAddArcSegment,
                                        onAddSamples,
                                        placeStart,
                                        setPlaceStart,
                                        shapeType,
                                        drawMode,
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
                                        editMode,
                                        selectedPointIndices,
                                        setSelectedPointIndices,
                                        updatePoint,
                                        updatePoints,
                                        deletePoints,
                                        onUpdateSegmentControl,
                                        onUpdateSegmentMid,
                                        onBeginEditAction,
                                        onEndEditAction,
                                        highlightSelection,
                                        palette,
                                        fieldSize,
                                    }) {
    const canvasRef = useRef(null);
    const overlayRef = useRef(null);
    const containerRef = useRef(null);
    const [dpr, setDpr] = useState(getDevicePixelRatio);
    const drawStateRef = useRef({drawing: false});

    // Zoom and pan state
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({x: 0, y: 0});
    const [isPanning, setIsPanning] = useState(false);
    const lastPanPos = useRef({x: 0, y: 0});
    const pendingScrollRef = useRef(null);

    const renderSize = useMemo(() => canvasSize * zoom, [canvasSize, zoom]);

    // Marquee selection state
    const [marquee, setMarquee] = useState(null); // {startX, startY, endX, endY} in canvas coords

    useEffect(() => {
        const handle = () => setDpr(getDevicePixelRatio());
        window.addEventListener("resize", handle);
        return () => window.removeEventListener("resize", handle);
    }, []);

    useEffect(() => {
        prepareCanvas(canvasRef.current, overlayRef.current, renderSize, dpr);
    }, [renderSize, dpr]);

    // Zoom handlers
    const handleZoom = useCallback((delta, clientX, clientY) => {
        const container = containerRef.current;
        if (!container) return;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + delta));
        if (newZoom === zoom) return;

        const containerRect = container.getBoundingClientRect();
        const offsetX = clientX - containerRect.left;
        const offsetY = clientY - containerRect.top;
        const pendingScroll = pendingScrollRef.current;
        const baseScrollLeft = pendingScroll ? pendingScroll.left : container.scrollLeft;
        const baseScrollTop = pendingScroll ? pendingScroll.top : container.scrollTop;
        const stackOffsetX = Math.max(0, (container.clientWidth - renderSize) / 2);
        const stackOffsetY = Math.max(0, (container.clientHeight - renderSize) / 2);
        const contentX = offsetX + baseScrollLeft - stackOffsetX;
        const contentY = offsetY + baseScrollTop - stackOffsetY;
        const scale = newZoom / zoom;

        const nextRenderSize = canvasSize * newZoom;
        const nextStackOffsetX = Math.max(0, (container.clientWidth - nextRenderSize) / 2);
        const nextStackOffsetY = Math.max(0, (container.clientHeight - nextRenderSize) / 2);
        const maxScrollLeft = Math.max(0, nextRenderSize - container.clientWidth);
        const maxScrollTop = Math.max(0, nextRenderSize - container.clientHeight);

        const nextScrollLeft = Math.min(
            maxScrollLeft,
            Math.max(0, contentX * scale + nextStackOffsetX - offsetX)
        );
        const nextScrollTop = Math.min(
            maxScrollTop,
            Math.max(0, contentY * scale + nextStackOffsetY - offsetY)
        );

        pendingScrollRef.current = {left: nextScrollLeft, top: nextScrollTop};
        setZoom(newZoom);
    }, [zoom, canvasSize, renderSize]);

    const handleWheel = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        handleZoom(delta, e.clientX, e.clientY);
    }, [handleZoom]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const onWheel = (event) => {
            event.preventDefault();
            event.stopPropagation();
            const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
            handleZoom(delta, event.clientX, event.clientY);
        };
        container.addEventListener("wheel", onWheel, { passive: false });
        return () => container.removeEventListener("wheel", onWheel);
    }, [handleZoom]);

    // Reset zoom and pan
    const resetView = useCallback(() => {
        setZoom(1);
        setPan({x: 0, y: 0});
    }, []);

    // Zoom controls
    const zoomIn = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        handleZoom(ZOOM_STEP * 2, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }, [handleZoom]);

    const zoomOut = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        handleZoom(-ZOOM_STEP * 2, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }, [handleZoom]);

    const ppi = useMemo(() => renderSize / fieldSize, [renderSize, fieldSize]);
    const center = useMemo(() => ({
        x: renderSize / 2 + pan.x,
        y: renderSize / 2 + pan.y
    }), [renderSize, pan]);

    const cx = (fieldY) => center.x - fieldY * ppi;
    const cy = (fieldX) => center.y - fieldX * ppi;

    const resolveHeading = useMemo(
        () => buildHeadingResolver({headingMode, endHeading, startPose, points: displayPoints}),
        [headingMode, endHeading, startPose, displayPoints],
    );

    const appendPoints = useMemo(() => ({
        getAnchor: () => (displayPoints.length
            ? displayPoints[displayPoints.length - 1]
            : {x: startPose.x ?? 0, y: startPose.y ?? 0, h: startPose.h ?? 0}
        ),
        single: (x, y) => onAddLineSegment?.(x, y),
        fromSamples: (samples, shapeType) => onAddSamples?.(samples, shapeType),
        bezier: (control, end) => onAddBezierSegment?.(control, end),
        arc: (mid, end) => onAddArcSegment?.(mid, end),
    }), [displayPoints, startPose, onAddLineSegment, onAddSamples, onAddBezierSegment, onAddArcSegment]);

    const handlers = useMemo(
        () =>
            createCanvasInteraction({
                canvasSize: renderSize,
                center,
                ppi,
                snapStep: createSnapStep(snapInches),
                placeStart,
                startPose,
                setStartPose,
                setPlaceStart,
                computeHeading: resolveHeading,
                shapeType,
                drawMode,
                appendPoints,
                setPendingBezier: setBezierTemp,
                bezierTemp,
                setPendingArc: setArcTemp,
                arcTemp,
                setPreview,
                drawStateRef,
                setDrawTemp,
                editMode,
                points: displayPoints,
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
            }),
        [
            renderSize,
            center,
            ppi,
            snapInches,
            placeStart,
            startPose,
            setStartPose,
            setPlaceStart,
            resolveHeading,
            shapeType,
            drawMode,
            appendPoints,
            setBezierTemp,
            bezierTemp,
            setArcTemp,
            arcTemp,
            setPreview,
            setDrawTemp,
            editMode,
            displayPoints,
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
            marquee,
            robot,
        ],
    );

    const cancelDraw = handlers.cancelDraw;

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === "Escape") cancelDraw();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [cancelDraw]);

    useEffect(() => {
        if (editMode || shapeType !== "draw" || placeStart) return;
        const state = drawStateRef.current;
        if (state?.drawing) return;
        const anchor = displayPoints.length ? displayPoints[displayPoints.length - 1] : startPose;
        if (!anchor) return;
        setPreview({x: anchor.x, y: anchor.y, h: anchor.h ?? startPose.h ?? 0});
    }, [shapeType, placeStart, displayPoints, startPose, setPreview, editMode]);

    // Clear preview when entering edit mode
    useEffect(() => {
        if (editMode) {
            setPreview(null);
        }
    }, [editMode, setPreview]);

    useEffect(() => {
        const pending = pendingScrollRef.current;
        const container = containerRef.current;
        if (!pending || !container) return;
        pendingScrollRef.current = null;
        requestAnimationFrame(() => {
            container.scrollLeft = pending.left;
            container.scrollTop = pending.top;
        });
    }, [renderSize]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        if (!canvas || !overlay) return;

        const baseCtx = canvas.getContext("2d");
        const overlayCtx = overlay.getContext("2d");

        drawPlannerScene({
            canvasCtx: baseCtx,
            overlayCtx,
            canvasSize: renderSize,
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
            highlightSelection,
            zoom: 1,
            marquee,
            segments,
        });

        if (preview) {
            const x = Number(preview.x ?? 0);
            const y = Number(preview.y ?? 0);

            const px = cx(y);
            const py = cy(x);

            overlayCtx.save();
            overlayCtx.beginPath();
            overlayCtx.arc(px, py, 4, 0, Math.PI * 2);
            overlayCtx.fillStyle = "#ffffff";
            overlayCtx.fill();
            overlayCtx.lineWidth = 2;
            overlayCtx.strokeStyle = "#000000";
            overlayCtx.stroke();
            overlayCtx.restore();
        }
    }, [
        renderSize,
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
        zoom,
        marquee,
        highlightSelection,
        segments,
    ]);

    // Pan handlers for middle mouse button
    const handlePanStart = useCallback((e) => {
        if (e.button === 1 || (e.button === 0 && e.altKey)) { // Middle mouse or Alt+left
            e.preventDefault();
            setIsPanning(true);
            lastPanPos.current = {x: e.clientX, y: e.clientY};
        }
    }, []);

    const handlePanMove = useCallback((e) => {
        if (!isPanning) return;
        const dx = e.clientX - lastPanPos.current.x;
        const dy = e.clientY - lastPanPos.current.y;
        setPan(prev => ({x: prev.x + dx, y: prev.y + dy}));
        lastPanPos.current = {x: e.clientX, y: e.clientY};
    }, [isPanning]);

    const handlePanEnd = useCallback(() => {
        setIsPanning(false);
    }, []);

    return (
        <div className="canvas-frame" ref={containerRef}>
            {/* Zoom Controls */}
            <div className="zoom-controls">
                <button className="zoom-btn" onClick={zoomIn} title="Zoom In">+</button>
                <span className="zoom-level">{Math.round(zoom * 100)}%</span>
                <button className="zoom-btn" onClick={zoomOut} title="Zoom Out">-</button>
                <button className="zoom-btn reset" onClick={resetView} title="Reset View">⟲</button>
            </div>
            <div 
                className="canvas-stack" 
                style={{
                    width: `${renderSize}px`, 
                    height: `${renderSize}px`,
                    cursor: isPanning ? 'grabbing' : (editMode ? 'crosshair' : undefined),
                }}
                onMouseDown={handlePanStart}
                onMouseMove={handlePanMove}
                onMouseUp={handlePanEnd}
                onMouseLeave={handlePanEnd}
            >
                <canvas
                    ref={canvasRef}
                    width={renderSize}
                    height={renderSize}
                    style={{
                        cursor: isPanning ? 'grabbing' : (shapeType === "draw" && !placeStart ? "none" : undefined),
                        touchAction: "none",
                    }}
                    onPointerDown={handlers.onPointerDown}
                    onPointerUp={handlers.onPointerUp}
                    onPointerMove={handlers.onPointerMove}
                    onPointerLeave={handlers.onPointerLeave}
                    onPointerCancel={handlers.onPointerCancel}
                    onClick={handlers.onClick}
                />
                <canvas ref={overlayRef} className="overlay" width={renderSize} height={renderSize} />
            </div>
        </div>
    );
}
