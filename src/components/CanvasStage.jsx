import {useEffect, useMemo, useRef, useState, useCallback} from "react";
import {
    buildHeadingResolver,
    createAppendPointsApi,
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
                                        editMode,
                                        selectedPointIndices,
                                        setSelectedPointIndices,
                                        updatePoint,
                                        updatePoints,
                                        deletePoints,
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
    
    // Marquee selection state
    const [marquee, setMarquee] = useState(null); // {startX, startY, endX, endY} in canvas coords

    useEffect(() => {
        const handle = () => setDpr(getDevicePixelRatio());
        window.addEventListener("resize", handle);
        return () => window.removeEventListener("resize", handle);
    }, []);

    useEffect(() => {
        prepareCanvas(canvasRef.current, overlayRef.current, canvasSize, dpr);
    }, [canvasSize, dpr]);

    // Zoom handlers
    const handleZoom = useCallback((delta, clientX, clientY) => {
        if (!canvasRef.current) return;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + delta));
        if (newZoom === zoom) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;
        
        const ratio = newZoom / zoom;
        const canvasCenter = canvasSize / 2;
        
        const mouseRelX = mouseX - canvasCenter;
        const mouseRelY = mouseY - canvasCenter;
        
        const newPanX = mouseRelX - (mouseRelX - pan.x) * ratio;
        const newPanY = mouseRelY - (mouseRelY - pan.y) * ratio;

        setZoom(newZoom);
        setPan({x: newPanX, y: newPanY});
    }, [zoom, pan, canvasSize]);

    const handleWheel = useCallback((e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        handleZoom(delta, e.clientX, e.clientY);
    }, [handleZoom]);

    // Reset zoom and pan
    const resetView = useCallback(() => {
        setZoom(1);
        setPan({x: 0, y: 0});
    }, []);

    // Zoom controls
    const zoomIn = useCallback(() => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        handleZoom(ZOOM_STEP * 2, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }, [handleZoom]);

    const zoomOut = useCallback(() => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        handleZoom(-ZOOM_STEP * 2, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }, [handleZoom]);

    const ppi = useMemo(() => (canvasSize / fieldSize) * zoom, [canvasSize, fieldSize, zoom]);
    const center = useMemo(() => ({
        x: canvasSize / 2 + pan.x,
        y: canvasSize / 2 + pan.y
    }), [canvasSize, pan]);

    const cx = (fieldY) => center.x - fieldY * ppi;
    const cy = (fieldX) => center.y - fieldX * ppi;

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
                setPendingBezier: setBezierTemp,
                bezierTemp,
                setPendingArc: setArcTemp,
                arcTemp,
                setPreview,
                drawStateRef,
                setDrawTemp,
                editMode,
                points,
                selectedPointIndices,
                setSelectedPointIndices,
                updatePoint,
                updatePoints,
                fieldSize,
                zoom,
                setMarquee,
                marquee,
                robot,
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
            editMode,
            points,
            selectedPointIndices,
            setSelectedPointIndices,
            updatePoint,
            updatePoints,
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
        const anchor = points.length ? points[points.length - 1] : startPose;
        if (!anchor) return;
        setPreview({x: anchor.x, y: anchor.y, h: anchor.h ?? startPose.h ?? 0});
    }, [shapeType, placeStart, points, startPose, setPreview, editMode]);

    // Clear preview when entering edit mode
    useEffect(() => {
        if (editMode) {
            setPreview(null);
        }
    }, [editMode, setPreview]);

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
            selectedPointIndices,
            editMode,
            palette,
            fieldSize,
            zoom,
            marquee,
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
        selectedPointIndices,
        editMode,
        zoom,
        marquee,
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
                <button className="zoom-btn" onClick={zoomOut} title="Zoom Out">−</button>
                <button className="zoom-btn reset" onClick={resetView} title="Reset View">⟲</button>
            </div>
            <div 
                className="canvas-stack" 
                style={{
                    width: `${canvasSize}px`, 
                    height: `${canvasSize}px`,
                    cursor: isPanning ? 'grabbing' : (editMode ? 'crosshair' : undefined),
                }}
                onMouseDown={handlePanStart}
                onMouseMove={handlePanMove}
                onMouseUp={handlePanEnd}
                onMouseLeave={handlePanEnd}
            >
                <canvas
                    ref={canvasRef}
                    width={canvasSize}
                    height={canvasSize}
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
                    onWheel={handleWheel}
                />
                <canvas ref={overlayRef} className="overlay" width={canvasSize} height={canvasSize} />
            </div>
        </div>
    );
}
