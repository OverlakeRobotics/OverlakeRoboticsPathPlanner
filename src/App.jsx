import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import decodeField from "./assets/decode_field.png";
import "./App.css";

import CanvasStage from "./components/CanvasStage";
import BuildPanel from "./components/panels/BuildPanel";
import RunPanel from "./components/panels/RunPanel";
import {
    DEFAULT_CANVAS_SIZE,
    DEFAULT_PLAYBACK_SPEED_IN_PER_S,
    DEFAULT_ROBOT_DIMENSIONS,
    DEFAULT_SNAP_IN,
    DEFAULT_TOLERANCE_IN,
    DEFAULT_VELOCITY_IN_PER_S,
    DEFAULT_LEFT_PANEL_WIDTH,
    DEFAULT_RIGHT_PANEL_WIDTH,
    GRID_DEFAULT_STEP,
    HUB_POINTS_URL,
    LIVE_POSE_SYNC_PREFIX,
    UPLOAD_RESET_FAIL_MS,
    UPLOAD_RESET_OK_MS,
} from "./constants/config";
import {usePosePolling} from "./hooks/usePosePolling";
import {usePlayback} from "./hooks/usePlayback";
import {clamp, num, normDeg, toFixed} from "./utils/math";
import {polylineLength} from "./utils/path";

export default function App() {
    const canvasSize = DEFAULT_CANVAS_SIZE;
    const [backgroundImage, setBackgroundImage] = useState(null);
    const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_PANEL_WIDTH);
    const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH);
    const layoutRef = useRef(null);
    const leftWidthRef = useRef(leftWidth);
    const rightWidthRef = useRef(rightWidth);
    const [isNarrow, setIsNarrow] = useState(false);

    const [startPose, setStartPose] = useState({x: 0, y: 0, h: 0});
    const [placeStart, setPlaceStart] = useState(false);

    const [points, setPoints] = useState([]);
    const [undoStack, setUndoStack] = useState([]);

    const [tags, setTags] = useState([]);
    const [tagName, setTagName] = useState("");
    const [tagValue, setTagValue] = useState(0);

    const [shapeType, setShapeType] = useState("line");
    const [headingMode, setHeadingMode] = useState("straight");
    const [endHeading, setEndHeading] = useState(0);

    const [velocity, setVelocity] = useState(DEFAULT_VELOCITY_IN_PER_S);
    const [playSpeed, setPlaySpeed] = useState(DEFAULT_PLAYBACK_SPEED_IN_PER_S);
    const [tolerance, setTolerance] = useState(String(DEFAULT_TOLERANCE_IN));
    const [snapInches, setSnapInches] = useState(String(DEFAULT_SNAP_IN));

    const [robotDimensions, setRobotDimensions] = useState({...DEFAULT_ROBOT_DIMENSIONS});

    const [showGrid, setShowGrid] = useState(false);
    const [gridStep, setGridStep] = useState(GRID_DEFAULT_STEP);
    const [gridStepEntry, setGridStepEntry] = useState(String(GRID_DEFAULT_STEP));

    const [preview, setPreview] = useState(null);
    const [bezierTemp, setBezierTemp] = useState(null);
    const [arcTemp, setArcTemp] = useState(null);

    const [copied, setCopied] = useState(false);
    const [uploadStatus, setUploadStatus] = useState("idle");
    const uploadTimerRef = useRef(null);
    const undoRef = useRef(() => {});

    const {livePose, robotState} = usePosePolling();

    useEffect(() => {
        const img = new Image();
        img.onload = () => setBackgroundImage(img);
        img.src = decodeField;
    }, []);

    useEffect(() => {
        leftWidthRef.current = leftWidth;
    }, [leftWidth]);

    useEffect(() => {
        rightWidthRef.current = rightWidth;
    }, [rightWidth]);

    useEffect(() => {
        const update = () => setIsNarrow(window.innerWidth <= 980);
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    const waypoints = useMemo(() => [{x: num(startPose.x), y: num(startPose.y)}, ...points.map((p) => ({x: p.x, y: p.y}))], [startPose, points]);
    const totalLength = useMemo(() => polylineLength(waypoints), [waypoints]);
    const endHeadingValue = useMemo(() => normDeg(num(endHeading)), [endHeading]);

    const {
        playState,
        playDist,
        togglePlay,
        stop: stopPlayback,
        setPlayDist,
    } = usePlayback({totalLength, speed: playSpeed});

    useEffect(() => {
        stopPlayback();
    }, [points, startPose.x, startPose.y, startPose.h, stopPlayback]);

    useEffect(() => {
        if (!livePose) return;
        const stateString = typeof robotState === "string" ? robotState.trim().toLowerCase() : "";
        if (!stateString.startsWith(LIVE_POSE_SYNC_PREFIX) || placeStart) return;
        const lx = num(livePose.x);
        const ly = num(livePose.y);
        const lh = normDeg(num(livePose.h ?? startPose.h ?? 0));
        const sx = num(startPose.x);
        const sy = num(startPose.y);
        const sh = normDeg(num(startPose.h ?? 0));
        const same = Math.abs(lx - sx) < 1e-3 && Math.abs(ly - sy) < 1e-3 && Math.abs(normDeg(lh - sh)) < 1e-2;
        if (same) return;
        setStartPose((prev) => ({...prev, x: lx, y: ly, h: lh}));
    }, [robotState, livePose, placeStart, startPose]);

    useEffect(() => () => {
        if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
    }, []);

    const beginResize = useCallback(
        (side) => (event) => {
            if (isNarrow) return;
            const container = layoutRef.current;
            if (!container) return;
            event.preventDefault();
            const pointerId = event.pointerId;
            const MIN_LEFT = 240;
            const MIN_RIGHT = 240;
            const MIN_CENTER = canvasSize;

            const handleMove = (moveEvent) => {
                if (moveEvent.pointerId !== pointerId) return;
                const rect = container.getBoundingClientRect();
                const totalWidth = rect.width;

                if (side === "left") {
                    const maxLeft = Math.max(MIN_LEFT, totalWidth - rightWidthRef.current - MIN_CENTER);
                    const proposed = moveEvent.clientX - rect.left;
                    const next = clamp(proposed, MIN_LEFT, maxLeft);
                    setLeftWidth(next);
                } else {
                    const maxRight = Math.max(MIN_RIGHT, totalWidth - leftWidthRef.current - MIN_CENTER);
                    const proposed = rect.right - moveEvent.clientX;
                    const next = clamp(proposed, MIN_RIGHT, maxRight);
                    setRightWidth(next);
                }
            };

            const handleUp = (upEvent) => {
                if (upEvent.pointerId !== pointerId) return;
                window.removeEventListener("pointermove", handleMove);
                window.removeEventListener("pointerup", handleUp);
            };

            window.addEventListener("pointermove", handleMove);
            window.addEventListener("pointerup", handleUp);
        },
        [canvasSize, isNarrow],
    );

    const shellStyle = isNarrow
        ? undefined
        : {
              "--left-panel": `${leftWidth}px`,
              "--right-panel": `${rightWidth}px`,
          };

    const togglePlaceStart = () => {
        setPreview(null);
        setPlaceStart((prev) => {
            const next = !prev;
            if (next) clearAll();
            return next;
        });
    };

    const clearAll = () => {
        setPoints([]);
        setUndoStack([]);
        setTags([]);
        setBezierTemp(null);
        setArcTemp(null);
        setPreview(null);
        stopPlayback();
    };

    const useLivePoseAsStart = () => {
        if (!livePose) return;
        clearAll();
        setStartPose({x: num(livePose.x), y: num(livePose.y), h: normDeg(num(livePose.h ?? 0))});
        setPlaceStart(false);
    };

    const commitGridStep = () => {
        const parsed = parseFloat(gridStepEntry);
        if (!gridStepEntry || !Number.isFinite(parsed) || parsed <= 0) {
            setGridStep(GRID_DEFAULT_STEP);
            setGridStepEntry(String(GRID_DEFAULT_STEP));
        } else {
            setGridStep(parsed);
            setGridStepEntry(String(parsed));
        }
    };

    const undoLast = useCallback(() => {
        if (bezierTemp) {
            setBezierTemp(null);
            setPreview(null);
            return;
        }
        if (arcTemp) {
            setArcTemp(null);
            setPreview(null);
            return;
        }
        if (undoStack.length === 0) return;
        const last = undoStack[undoStack.length - 1];
        const removeCount = Math.max(0, last?.count ?? 0);
        if (removeCount > 0) setPoints((prev) => prev.slice(0, Math.max(0, prev.length - removeCount)));
        setUndoStack((prev) => prev.slice(0, -1));
    }, [bezierTemp, arcTemp, undoStack]);

    useEffect(() => {
        undoRef.current = undoLast;
    }, [undoLast]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            const isMac = navigator.platform.toLowerCase().includes("mac");
            const modifier = isMac ? event.metaKey : event.ctrlKey;
            if (modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "z") {
                event.preventDefault();
                undoRef.current();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    const addTag = () => {
        if (points.length === 0) return;
        const name = (tagName ?? "").trim();
        if (!name) return;
        const value = Math.floor(Number(tagValue) || 0);
        setTags((prev) => [...prev, {index: points.length, name, value}]);
        setTagName("");
        setTagValue(0);
    };

    const removeTag = (index) => setTags((prev) => prev.filter((_, i) => i !== index));

    const triggerCopiedFeedback = () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
    };

    const copyCode = () => {
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(code).then(triggerCopiedFeedback, triggerCopiedFeedback);
        } else {
            triggerCopiedFeedback();
        }
    };

    const doUpload = () => {
        if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
        setUploadStatus("sending");
        const payload = {
            start: [num(startPose.x), num(startPose.y), num(startPose.h)],
            points: points.map((p) => [Number(p.x), Number(p.y), Number(p.h ?? 0)]),
            velocity: Number(velocity) || 0,
            tolerance: Number(tolerance) || 0,
            tags: tags.map((tag) => ({index: Number(tag.index) || 0, name: String(tag.name || ""), value: Number(tag.value) || 0})),
        };
        fetch(HUB_POINTS_URL, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload),
        })
            .then(() => {
                setUploadStatus("ok");
                uploadTimerRef.current = setTimeout(() => setUploadStatus("idle"), UPLOAD_RESET_OK_MS);
            })
            .catch(() => {
                setUploadStatus("fail");
                uploadTimerRef.current = setTimeout(() => setUploadStatus("idle"), UPLOAD_RESET_FAIL_MS);
            });
    };

    const code = useMemo(() => {
        const sx = toFixed(num(startPose.x));
        const sy = toFixed(num(startPose.y));
        const sh = toFixed(num(startPose.h));
        const poseLines = [
            `    new Pose2D(DistanceUnit.INCH, ${sx}, ${sy}, AngleUnit.DEGREES, ${sh})`,
            ...points
                .map((p) => ({x: toFixed(p.x), y: toFixed(p.y), h: toFixed(num(p.h ?? 0))}))
                .map((p) => `    new Pose2D(DistanceUnit.INCH, ${p.x}, ${p.y}, AngleUnit.DEGREES, ${p.h})`),
        ].join(",\n");
        const tagsBlock = tags
            .map((tag) => `    new Tag("${(tag.name ?? "").replace(/"/g, '\\"')}", ${Number(tag.value) || 0}, ${Number(tag.index) || 0})`)
            .join(",\n");
        return `// ---- PATH ----\npublic static Pose2D[] path = new Pose2D[] {\n${poseLines}\n};\n\n// ---- TAGS ----\npublic static class Tag {\n    public final String name; public final int value; public final int index;\n    public Tag(String name, int value, int index){ this.name=name; this.value=value; this.index=index; }\n}\npublic static Tag[] tags = new Tag[] {\n${tagsBlock}\n};\n\n// ---- CONFIG ----\npublic static double VELOCITY_IN_S = ${toFixed(velocity, 2)};\npublic static double TOLERANCE_IN = ${toFixed(Number(tolerance) || 0, 2)};`;
    }, [points, startPose, tags, velocity, tolerance]);

    const handleTogglePlay = () => {
        if (!points.length || totalLength <= 0) return;
        togglePlay();
    };

    const handleStop = () => {
        stopPlayback();
        setPlayDist(0);
    };

    return (
        <div className="app-shell" ref={layoutRef} style={shellStyle}>
            <BuildPanel
                shapeType={shapeType}
                setShapeType={(type) => {
                    setShapeType(type);
                    setBezierTemp(null);
                    setArcTemp(null);
                }}
                headingMode={headingMode}
                setHeadingMode={setHeadingMode}
                endHeading={endHeading}
                setEndHeading={setEndHeading}
                velocity={velocity}
                setVelocity={setVelocity}
                playSpeed={playSpeed}
                setPlaySpeed={setPlaySpeed}
                tolerance={tolerance}
                setTolerance={setTolerance}
                snapInches={snapInches}
                setSnapInches={setSnapInches}
                startPose={startPose}
                setStartPose={setStartPose}
                placeStart={placeStart}
                togglePlaceStart={togglePlaceStart}
                useLivePose={useLivePoseAsStart}
                livePoseAvailable={Boolean(livePose)}
                showGrid={showGrid}
                setShowGrid={setShowGrid}
                gridStepEntry={gridStepEntry}
                setGridStepEntry={setGridStepEntry}
                commitGridStep={commitGridStep}
                robotDimensions={robotDimensions}
                setRobotDimensions={setRobotDimensions}
                tagName={tagName}
                setTagName={setTagName}
                tagValue={tagValue}
                setTagValue={setTagValue}
                addTag={addTag}
                pointsLength={points.length}
            />

            {!isNarrow && (
                <div
                    className="resize-handle handle-left"
                    onPointerDown={beginResize("left")}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize planner controls panel"
                />
            )}

            <div className="canvas-column">
                <CanvasStage
                    canvasSize={canvasSize}
                    backgroundImage={backgroundImage}
                    showGrid={showGrid}
                    gridStep={gridStep}
                    startPose={startPose}
                    setStartPose={setStartPose}
                    points={points}
                    setPoints={setPoints}
                    setUndoStack={setUndoStack}
                    placeStart={placeStart}
                    setPlaceStart={setPlaceStart}
                    shapeType={shapeType}
                    headingMode={headingMode}
                    endHeading={endHeadingValue}
                    snapInches={snapInches}
                    preview={preview}
                    setPreview={setPreview}
                    bezierTemp={bezierTemp}
                    setBezierTemp={setBezierTemp}
                    arcTemp={arcTemp}
                    setArcTemp={setArcTemp}
                    robot={robotDimensions}
                    livePose={livePose}
                    playState={playState}
                    playDist={playDist}
                    waypoints={waypoints}
                />
            </div>

            {!isNarrow && (
                <div
                    className="resize-handle handle-right"
                    onPointerDown={beginResize("right")}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize run panel"
                />
            )}

            <RunPanel
                onUpload={doUpload}
                uploadStatus={uploadStatus}
                onCopy={copyCode}
                copied={copied}
                playState={playState}
                onTogglePlay={handleTogglePlay}
                onStop={handleStop}
                pointsCount={points.length}
                totalLength={totalLength}
                velocity={velocity}
                playDist={playDist}
                code={code}
                onUndo={undoLast}
                onClear={clearAll}
                tags={tags}
                onRemoveTag={removeTag}
            />
        </div>
    );
}
