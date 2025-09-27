import {useEffect, useMemo, useRef, useState} from "react";
import {FIELD_SIZE_IN} from "../constants/config";
import {
    buildHeadingResolver,
    createAppendPointsApi,
    createCanvasInteraction,
    createSnapStep,
    drawPlannerScene,
    prepareCanvas,
} from "../utils/canvas";

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
    robot,
    livePose,
    playState,
    playDist,
    waypoints,
}) {
    const canvasRef = useRef(null);
    const overlayRef = useRef(null);
    const [dpr, setDpr] = useState(getDevicePixelRatio);

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
        ],
    );

    useEffect(() => {
        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        if (!canvas || !overlay) return;
        drawPlannerScene({
            canvasCtx: canvas.getContext("2d"),
            overlayCtx: overlay.getContext("2d"),
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
        });
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
    ]);

    return (
        <div className="canvas-frame">
            <div className="canvas-stack" style={{width: `${canvasSize}px`, height: `${canvasSize}px`}}>
                <canvas
                    ref={canvasRef}
                    width={canvasSize}
                    height={canvasSize}
                    onMouseMove={handlers.onMouseMove}
                    onMouseLeave={handlers.onMouseLeave}
                    onClick={handlers.onClick}
                />
                <canvas ref={overlayRef} className="overlay" width={canvasSize} height={canvasSize} />
            </div>
        </div>
    );
}
