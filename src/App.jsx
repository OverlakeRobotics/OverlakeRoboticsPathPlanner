import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import decodeField from "./assets/decode_field.png";
import "./App.css";

import CanvasStage from "./components/CanvasStage";
import BuildPanel from "./components/panels/BuildPanel";
import RunPanel from "./components/panels/RunPanel";
import TagModal from "./components/TagModal";
import ExportModal from "./components/ExportModal";
import SetupModal from "./components/SetupModal";
import {
    DEFAULT_CANVAS_SIZE,
    DEFAULT_MAX_ACCEL_IN_PER_S2,
    DEFAULT_PLAYBACK_SPEED_IN_PER_S,
    DEFAULT_ROBOT_DIMENSIONS,
    DEFAULT_SNAP_IN,
    DEFAULT_TOLERANCE_IN,
    DEFAULT_VELOCITY_IN_PER_S,
    DEFAULT_LEFT_PANEL_WIDTH,
    DEFAULT_RIGHT_PANEL_WIDTH,
    MIN_LEFT_PANEL_WIDTH,
    MIN_RIGHT_PANEL_WIDTH,
    GRID_DEFAULT_STEP,
    HUB_IP,
    FIELD_SIZE_IN,
    PATH_COLOR,
    START_COLOR,
    WAYPOINT_COLOR,
    FOOTPRINT_FILL,
    LIVE_POSE_FILL,
    PREVIEW_FILL,
    EPS,
    LIVE_POSE_SYNC_PREFIX,
    SPEED_PROFILE_SAMPLE_STEP_IN,
    UPLOAD_RESET_FAIL_MS,
    UPLOAD_RESET_OK_MS,
} from "./constants/config";
import {usePosePolling} from "./hooks/usePosePolling";
import {usePlayback} from "./hooks/usePlayback";
import {useTheme} from "./hooks/useTheme";
import {useRobotConnection} from "./hooks/useRobotConnection";
import {clamp, num, normDeg, toFixed} from "./utils/math";
import {polylineLength} from "./utils/path";

function wrapAngleRad(a) {
    // wrap to (-π, π]
    let x = a % (2 * Math.PI);
    if (x <= -Math.PI) x += 2 * Math.PI;
    if (x > Math.PI) x -= 2 * Math.PI;
    return x;
}

function buildSpeedProfile(waypoints, vmax_in_s, a_max_in_s2) {
    const vmax = Math.max(EPS, Number(vmax_in_s) || 0);
    const amax = Math.max(EPS, Number(a_max_in_s2) || 0);
    const N = waypoints.length;
    if (N < 2) {
        return {
            s: [0],
            v: [0],
            t: [0],
            totalLen: 0,
            totalTime: 0,
            sOfT: () => 0,
        };
    }

    const segLen = [];
    const segDir = [];
    let totalLen = 0;
    for (let i = 0; i < N - 1; i++) {
        const dx = waypoints[i + 1].x - waypoints[i].x;
        const dy = waypoints[i + 1].y - waypoints[i].y;
        const L = Math.hypot(dx, dy);
        segLen.push(L);
        segDir.push(Math.atan2(dy, dx));
        totalLen += L;
    }
    if (totalLen < EPS) {
        return {
            s: [0],
            v: [0],
            t: [0],
            totalLen: 0,
            totalTime: 0,
            sOfT: () => 0,
        };
    }

    const kappaVertex = new Array(N).fill(0);
    for (let i = 1; i < N - 1; i++) {
        const d1 = segDir[i - 1];
        const d2 = segDir[i];
        const turn = Math.abs(wrapAngleRad(d2 - d1));
        const dsLocal = Math.max(EPS, 0.5 * (segLen[i - 1] + segLen[i]));
        kappaVertex[i] = turn / dsLocal;
    }

    const s = [0];
    const kappa = [kappaVertex[0]];
    let accS = 0;
    for (let i = 0; i < N - 1; i++) {
        const L = segLen[i];
        if (L < EPS) continue;
        const steps = Math.max(1, Math.round(L / SPEED_PROFILE_SAMPLE_STEP_IN));
        for (let j = 1; j <= steps; j++) {
            const alpha = j / steps;
            const sHere = accS + alpha * L;
            const k = (1 - alpha) * kappaVertex[i] + alpha * kappaVertex[i + 1];
            s.push(sHere);
            kappa.push(k);
        }
        accS += L;
    }
    const M = s.length;

    const vCurve = new Array(M);
    for (let i = 0; i < M; i++) {
        const k = Math.abs(kappa[i]);
        if (k < 1e-8) vCurve[i] = Infinity;
        else vCurve[i] = Math.sqrt(Math.max(EPS, amax / k));
    }

    const v = vCurve.map((vc) => Math.min(vmax, vc));

    for (let i = 1; i < M; i++) {
        const ds = s[i] - s[i - 1];
        v[i] = Math.min(v[i], Math.sqrt(v[i - 1] * v[i - 1] + 2 * amax * ds));
    }

    for (let i = M - 2; i >= 0; i--) {
        const ds = s[i + 1] - s[i];
        v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * amax * ds));
    }

    const t = new Array(M).fill(0);
    for (let i = 1; i < M; i++) {
        const ds = s[i] - s[i - 1];
        const vAvg = Math.max(EPS, 0.5 * (v[i] + v[i - 1]));
        t[i] = t[i - 1] + ds / vAvg;
    }
    const totalTime = t[M - 1];

    function sOfT(time) {
        if (time <= 0) return 0;
        if (time >= totalTime) return totalLen;
        // binary search in t[]
        let lo = 0, hi = M - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (t[mid] <= time) lo = mid;
            else hi = mid;
        }
        const dt = t[hi] - t[lo];
        const alpha = dt > EPS ? (time - t[lo]) / dt : 0;
        return s[lo] + alpha * (s[hi] - s[lo]);
    }

    return {s, v, t, totalLen, totalTime, sOfT};
}


export default function App() {
    const canvasSize = DEFAULT_CANVAS_SIZE;
    const [backgroundImage, setBackgroundImage] = useState(null);
    const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_PANEL_WIDTH);
    const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH);
    const layoutRef = useRef(null);
    const leftWidthRef = useRef(leftWidth);
    const rightWidthRef = useRef(rightWidth);
    const [isNarrow, setIsNarrow] = useState(false);

    // Settings State
    const [showSetupModal, setShowSetupModal] = useState(false);
    const [hubIp, setHubIp] = useState(HUB_IP);
    const [fieldSize, setFieldSize] = useState(FIELD_SIZE_IN);
    const [palette, setPalette] = useState({
        path: PATH_COLOR,
        start: START_COLOR,
        waypoint: WAYPOINT_COLOR,
        footprint: FOOTPRINT_FILL,
        livePose: LIVE_POSE_FILL,
        preview: PREVIEW_FILL
    });
    
    // UI Effects State
    const [themeName, setThemeName] = useState("default");
    const [blurStrength, setBlurStrength] = useState(16);
    const [panelOpacity, setPanelOpacity] = useState(0.85);
    const [cardOpacity, setCardOpacity] = useState(0.6);
    const [uiScale, setUiScale] = useState(0.8);
    
    // Apply theme settings via hook
    useTheme({ blurStrength, panelOpacity, cardOpacity, uiScale, palette, themeName });

    useEffect(() => {
        const stored = localStorage.getItem("planner_settings");
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed.hubIp) setHubIp(parsed.hubIp);
                if (parsed.fieldSize) setFieldSize(parsed.fieldSize);
                if (parsed.palette) setPalette(parsed.palette);
                if (parsed.themeName) setThemeName(parsed.themeName);
                if (parsed.blurStrength !== undefined) setBlurStrength(parsed.blurStrength);
                if (parsed.panelOpacity !== undefined) setPanelOpacity(parsed.panelOpacity);
                if (parsed.cardOpacity !== undefined) setCardOpacity(parsed.cardOpacity);
                if (parsed.uiScale !== undefined) setUiScale(parsed.uiScale);
            } catch (e) {
                console.error("Failed to parse settings", e);
            }
        } else {
            setShowSetupModal(true);
        }
    }, []);

    const handleSaveSettings = (settings) => {
        setHubIp(settings.hubIp);
        setFieldSize(settings.fieldSize);
        setPalette(settings.palette);
        setThemeName(settings.themeName);
        setBlurStrength(settings.blurStrength);
        setPanelOpacity(settings.panelOpacity);
        setCardOpacity(settings.cardOpacity);
        setUiScale(settings.uiScale);
        localStorage.setItem("planner_settings", JSON.stringify(settings));
    };

    const [startPose, setStartPose] = useState({x: 0, y: 0, h: 0});
    const [placeStart, setPlaceStart] = useState(false);

    const [points, setPointsInternal] = useState([]);
    const [undoStack, setUndoStack] = useState([]);
    const [shouldShowTagModal, setShouldShowTagModal] = useState(true);

    // Point editing state
    const [selectedPointIndices, setSelectedPointIndices] = useState([]); // Now an array for multi-selection
    const [editMode, setEditMode] = useState(false); // When true, enable point editing

    const setPoints = useCallback((updater) => {
        setPointsInternal((prev) => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            // Check if points were added (one at a time, not bulk operations)
            if (shouldShowTagModal && next.length === prev.length + 1) {
                // Show modal for the last added point
                setPendingTagPointIndex(next.length);
                setShowTagModal(true);
            }
            return next;
        });
    }, [shouldShowTagModal]);

    const setPointsWithoutModal = useCallback((updater) => {
        setShouldShowTagModal(false);
        setPointsInternal(updater);
        // Re-enable modal after a short delay
        setTimeout(() => setShouldShowTagModal(true), 100);
    }, []);

    const [tags, setTags] = useState([]);
    const [tagName, setTagName] = useState("");
    const [tagValue, setTagValue] = useState("");
    const [tagPointIndex, setTagPointIndex] = useState(""); // Index for manual tag placement
    const [showTagModal, setShowTagModal] = useState(false);
    const [pendingTagPointIndex, setPendingTagPointIndex] = useState(null);
    const [showExportModal, setShowExportModal] = useState(false);

    const [shapeType, setShapeType] = useState("line");
    const [headingMode, setHeadingMode] = useState("straight");
    const [endHeading, setEndHeading] = useState(String(0));

    const [velocity, setVelocity] = useState(String(DEFAULT_VELOCITY_IN_PER_S));
    const [playSpeed, setPlaySpeed] = useState(String(DEFAULT_PLAYBACK_SPEED_IN_PER_S));
    const [maxAccel, setMaxAccel] = useState(String(DEFAULT_MAX_ACCEL_IN_PER_S2));
    const [tolerance, setTolerance] = useState(String(DEFAULT_TOLERANCE_IN));
    const [snapInches, setSnapInches] = useState(String(DEFAULT_SNAP_IN));

    const [robotDimensions, setRobotDimensions] = useState({...DEFAULT_ROBOT_DIMENSIONS});

    const [showGrid, setShowGrid] = useState(false);
    const [gridStep, setGridStep] = useState(GRID_DEFAULT_STEP);
    const [gridStepEntry, setGridStepEntry] = useState(String(GRID_DEFAULT_STEP));

    const [preview, setPreview] = useState(null);
    const [bezierTemp, setBezierTemp] = useState(null);
    const [arcTemp, setArcTemp] = useState(null);
    const [drawTemp, setDrawTemp] = useState(null);

    const [copied, setCopied] = useState(false);
    const [uploadStatus, setUploadStatus] = useState("idle");
    const [runStatus, setRunStatus] = useState("idle");
    const uploadTimerRef = useRef(null);
    const runTimerRef = useRef(null);
    const undoRef = useRef(() => {});

    const { isConnected, robotStatus, robotConfig, sendInit, sendStart, sendStop, livePose } = useRobotConnection(hubIp);
    const robotState = robotStatus?.activeOpModeStatus || null;

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

    const waypoints = useMemo(
        () => [{x: num(startPose.x), y: num(startPose.y)}, ...points.map((p) => ({x: p.x, y: p.y}))],
        [startPose, points]
    );
    const totalLength = useMemo(() => polylineLength(waypoints), [waypoints]);
    const endHeadingValue = useMemo(() => normDeg(num(endHeading)), [endHeading]);

    const previewProfile = useMemo(
        () => buildSpeedProfile(waypoints, playSpeed, maxAccel),
        [waypoints, playSpeed, maxAccel]
    );

    const runProfile = useMemo(
        () => buildSpeedProfile(waypoints, velocity, maxAccel),
        [waypoints, velocity, maxAccel]
    );

    const {
        playState,
        playDist: playTime, // seconds
        togglePlay,
        stop: stopPlayback,
        setPlayDist: setPlayTime,
    } = usePlayback({totalLength: previewProfile.totalTime || 0, speed: 1});

    const playDist = useMemo(() => previewProfile.sOfT(playTime || 0), [previewProfile, playTime]);

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
        if (runTimerRef.current) clearTimeout(runTimerRef.current);
    }, []);

    const beginResize = useCallback(
        (side) => (event) => {
            if (isNarrow) return;
            const container = layoutRef.current;
            if (!container) return;
            event.preventDefault();
            const pointerId = event.pointerId;
            const MIN_LEFT = MIN_LEFT_PANEL_WIDTH;
            const MIN_RIGHT = MIN_RIGHT_PANEL_WIDTH;
            const MIN_CENTER = canvasSize;

            const handleMove = (moveEvent) => {
                if (moveEvent.pointerId !== pointerId) return;
                const rect = container.getBoundingClientRect();
                if (side === "left") {
                    const maxLeft = Math.max(MIN_LEFT, rect.width - rightWidthRef.current - MIN_CENTER);
                    const proposed = moveEvent.clientX - rect.left;
                    const next = clamp(proposed, MIN_LEFT, maxLeft);
                    setLeftWidth(next);
                } else {
                    const maxRight = Math.max(MIN_RIGHT, rect.width - leftWidthRef.current - MIN_CENTER);
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
        : { "--left-panel": `${leftWidth}px`, "--right-panel": `${rightWidth}px` };

    const togglePlaceStart = () => {
        setPreview(null);
        setDrawTemp(null);
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
        setDrawTemp(null);
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
        if (bezierTemp) { setBezierTemp(null); setPreview(null); return; }
        if (arcTemp)    { setArcTemp(null);    setPreview(null); return; }
        if (undoStack.length === 0) return;
        const last = undoStack[undoStack.length - 1];
        const removeCount = Math.max(0, last?.count ?? 0);
        if (removeCount > 0) setPoints((prev) => prev.slice(0, Math.max(0, prev.length - removeCount)));
        setUndoStack((prev) => prev.slice(0, -1));
    }, [bezierTemp, arcTemp, undoStack]);

    useEffect(() => { undoRef.current = undoLast; }, [undoLast]);

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
        const value = Number(tagValue) || 0;
        const targetIndex = Math.max(1, Math.min(points.length, Number(tagPointIndex) || points.length));
        setTags((prev) => [...prev, {index: targetIndex, name, value}]);
        setTagName("");
        setTagValue("");
        setTagPointIndex("");
    };

    const addTagFromModal = (name, value, pointIndex) => {
        setTags((prev) => [...prev, {index: pointIndex, name, value}]);
    };

    const addTagFromRunPanel = (name, value, pointIndex) => {
        setTags((prev) => [...prev, {index: pointIndex, name, value}]);
    };

    const removeTag = (index) => setTags((prev) => prev.filter((_, i) => i !== index));

    const editTag = (index, name, value, pointIndex) => {
        setTags((prev) => {
            const updated = [...prev];
            updated[index] = { name, value, index: pointIndex };
            return updated;
        });
    };

    const reorderTags = (fromIndex, toIndex) => {
        setTags((prev) => {
            const updated = [...prev];
            const [movedTag] = updated.splice(fromIndex, 1);
            updated.splice(toIndex, 0, movedTag);
            return updated;
        });
    };

    // Point editing functions
    const updatePoint = (index, updates) => {
        setPoints((prev) => {
            const updated = [...prev];
            updated[index] = {...updated[index], ...updates};
            return updated;
        });
    };

    // Update multiple points at once (for multi-selection drag)
    const updatePoints = (indices, deltaX, deltaY) => {
        setPoints((prev) => {
            const updated = [...prev];
            indices.forEach(index => {
                if (updated[index]) {
                    updated[index] = {
                        ...updated[index],
                        x: updated[index].x + deltaX,
                        y: updated[index].y + deltaY,
                    };
                }
            });
            return updated;
        });
    };

    const deletePoint = (index) => {
        setPoints((prev) => prev.filter((_, i) => i !== index));
        setSelectedPointIndices(prev => prev.filter(i => i !== index).map(i => i > index ? i - 1 : i));
        // Update tags that reference points after the deleted one
        setTags((prev) => prev
            .filter(tag => tag.index !== index + 1) // Remove tags for deleted point
            .map(tag => tag.index > index + 1 ? {...tag, index: tag.index - 1} : tag)
        );
    };

    // Delete multiple selected points
    const deletePoints = (indices) => {
        const sortedIndices = [...indices].sort((a, b) => b - a); // Sort descending
        setPoints((prev) => prev.filter((_, i) => !indices.includes(i)));
        setSelectedPointIndices([]);
        // Update tags
        setTags((prev) => {
            let updatedTags = [...prev];
            sortedIndices.forEach(index => {
                updatedTags = updatedTags
                    .filter(tag => tag.index !== index + 1)
                    .map(tag => tag.index > index + 1 ? {...tag, index: tag.index - 1} : tag);
            });
            return updatedTags;
        });
    };

    const toggleEditMode = () => {
        setEditMode(prev => !prev);
        if (editMode) {
            setSelectedPointIndices([]);
        }
    };

    const switchSides = () => {
        // Mirror all points and start pose along the Y-axis (flip Y coordinates, top-bottom)
        // Also swap autoAimRed <-> autoAimBlue tags
        
        // Mirror start pose
        setStartPose((prev) => {
            const newH = -prev.h; // Flip heading vertically
            return {
                ...prev,
                y: -prev.y,
                h: normDeg(newH), // Mirror heading angle and normalize
            };
        });

        // Mirror all points
        setPointsWithoutModal((prev) => prev.map((p) => {
            const newH = p.h !== undefined ? -p.h : undefined;
            return {
                ...p,
                y: -p.y,
                h: newH !== undefined ? normDeg(newH) : undefined, // Mirror heading angle and normalize
            };
        }));

        // Swap autoAimRed <-> autoAimBlue tags
        setTags((prev) => prev.map((tag) => {
            if (tag.name === "autoAimRed") {
                return { ...tag, name: "autoAimBlue" };
            } else if (tag.name === "autoAimBlue") {
                return { ...tag, name: "autoAimRed" };
            }
            return tag;
        }));

        // Stop playback when switching sides
        stopPlayback();
    };

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
            version: 1,
            start: [num(startPose.x), num(startPose.y), num(startPose.h)],
            points: points.map((p) => [Number(p.x), Number(p.y), Number(p.h ?? 0)]),
            velocity: Number(velocity) || 0,
            tolerance: Number(tolerance) || 0,
            tags: tags.map((tag) => ({index: Number(tag.index) || 0, name: String(tag.name || ""), value: Number(tag.value) || 0})),
        };
        return fetch(`http://${hubIp}:8099/points`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload),
        })
            .then(() => {
                setUploadStatus("ok");
                uploadTimerRef.current = setTimeout(() => setUploadStatus("idle"), UPLOAD_RESET_OK_MS);
            })
            .catch((e) => {
                setUploadStatus("fail");
                uploadTimerRef.current = setTimeout(() => setUploadStatus("idle"), UPLOAD_RESET_FAIL_MS);
                throw e;
            });
    };

    const doInstantUploadInit = async () => {
        // First request the robot to init the Path Planner op mode, then upload once the robot reports the op mode.
        try {
            setUploadStatus("sending");
            sendInit("Path Planner");

            // Wait up to 6s for the robotStatus.opMode to reflect the requested op mode
            const start = Date.now();
            const timeoutMs = 6000;
            const pollMs = 400;
            let ready = false;
            while (Date.now() - start < timeoutMs) {
                // Prefer explicit opMode match; fall back to presence of robotConfig or connection
                if (robotStatus && robotStatus.opMode && String(robotStatus.opMode).includes("Path")) {
                    ready = true;
                    break;
                }
                if (robotConfig) {
                    ready = true;
                    break;
                }
                // sleep
                // eslint-disable-next-line no-await-in-loop
                await new Promise((r) => setTimeout(r, pollMs));
            }

            if (!ready) {
                // Robot didn't come up in time; mark failure
                setUploadStatus("fail");
                uploadTimerRef.current = setTimeout(() => setUploadStatus("idle"), UPLOAD_RESET_FAIL_MS);
                return;
            }

            // Now perform the upload
            await doUpload();
        } catch (e) {
            // doUpload and other failures already set status; ensure it's marked
            setUploadStatus((s) => (s === "sending" ? "fail" : s));
        }
    };

    const doRun = () => {
        if (runTimerRef.current) clearTimeout(runTimerRef.current);
        setRunStatus("sending");
        fetch(`http://${hubIp}:8099/run`, {
            method: "POST",
        })
            .then((response) => {
                if (!response.ok) throw new Error("Run request failed");
                return response.json().catch(() => null);
            })
            .then(() => {
                setRunStatus("ok");
                runTimerRef.current = setTimeout(() => setRunStatus("idle"), UPLOAD_RESET_OK_MS);
            })
            .catch(() => {
                setRunStatus("fail");
                runTimerRef.current = setTimeout(() => setRunStatus("idle"), UPLOAD_RESET_FAIL_MS);
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
        return `// ---- PATH ----
public static Pose2D[] path = new Pose2D[] {
${poseLines}
};

// ---- TAGS ----
public static class Tag {
    public final String name; public final int value; public final int index;
    public Tag(String name, int value, int index){ this.name=name; this.value=value; this.index=index; }
}
public static Tag[] tags = new Tag[] {
${tagsBlock}
};

// ---- CONFIG ----
public static double VELOCITY_IN_S = ${toFixed(velocity, 2)};
public static double MAX_ACCEL_IN_S2 = ${toFixed(Number(maxAccel) || 0, 2)};
public static double TOLERANCE_IN = ${toFixed(Number(tolerance) || 0, 2)};`;
    }, [points, startPose, tags, velocity, maxAccel, tolerance]);

    const buildSerializable = () => ({
        version: 1,
        createdAt: new Date().toISOString(),
        start: {x: num(startPose.x), y: num(startPose.y), h: num(startPose.h)},
        points: points.map((p) => ({x: Number(p.x), y: Number(p.y), h: Number(p.h ?? 0)})),
        headingMode,
        endHeading: endHeadingValue,
        velocity: Number(velocity) || 0,
        maxAccel: Number(maxAccel) || 0,
        tolerance: Number(tolerance) || 0,
        snapInches: Number(snapInches) || 0,
        robot: {...robotDimensions},
        tags: tags.map((t) => ({index: Number(t.index) || 0, name: String(t.name || ""), value: Number(t.value) || 0})),
    });

    const onExportPath = () => {
        setShowExportModal(true);
    };

    const handleExportWithName = (fileName) => {
        const cleanedName = fileName.replace(/\.json$/i, '') + '.json';
        const obj = buildSerializable();
        const blob = new Blob([JSON.stringify(obj, null, 2)], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = cleanedName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const onImportPath = async (file) => {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const getNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

            if (data.start) {
                if (Array.isArray(data.start)) {
                    setStartPose({x: getNum(data.start[0]), y: getNum(data.start[1]), h: normDeg(getNum(data.start[2]))});
                } else {
                    setStartPose({x: getNum(data.start.x), y: getNum(data.start.y), h: normDeg(getNum(data.start.h))});
                }
            }
            if (Array.isArray(data.points)) {
                const pts = data.points.map((p) =>
                    Array.isArray(p) ? {x: getNum(p[0]), y: getNum(p[1]), h: normDeg(getNum(p[2]))} :
                        {x: getNum(p.x), y: getNum(p.y), h: normDeg(getNum(p.h))}
                );
                setPointsWithoutModal(pts);
            }
            if (typeof data.headingMode === "string") setHeadingMode(data.headingMode);
            if (Number.isFinite(Number(data.endHeading))) setEndHeading(String(Number(data.endHeading)));
            if (Number.isFinite(Number(data.velocity))) setVelocity(String(Number(data.velocity)));
            if (Number.isFinite(Number(data.maxAccel))) setMaxAccel(String(Number(data.maxAccel)));
            if (Number.isFinite(Number(data.tolerance))) setTolerance(String(Number(data.tolerance)));
            if (Number.isFinite(Number(data.snapInches))) setSnapInches(String(Number(data.snapInches)));
            if (data.robot && typeof data.robot === "object") setRobotDimensions({...robotDimensions, ...data.robot});
            if (Array.isArray(data.tags)) setTags(data.tags.map((t) => ({
                index: getNum(t.index),
                name: String(t.name || ""),
                value: getNum(t.value),
            })));

            setBezierTemp(null);
            setArcTemp(null);
            setPreview(null);
            setUndoStack([]);
            setPlaceStart(false);
            stopPlayback();
        } catch (err) {
            console.error("Failed to import path:", err);
            alert("Could not import file. Make sure it's a valid path JSON.");
        }
    };

    const handleTogglePlay = () => {
        if (!points.length || totalLength <= 0) return;
        togglePlay();
    };

    const handleStop = () => {
        stopPlayback();
        setPlayTime(0); // reset "time"
    };

    const estRunTimeSeconds = runProfile.totalTime;

    return (
        <div className="app-scale">
        <SetupModal
            isOpen={showSetupModal}
            onClose={() => setShowSetupModal(false)}
            onSave={handleSaveSettings}
            initialSettings={{ 
                hubIp, 
                fieldSize, 
                palette,
                themeName,
                blurStrength,
                panelOpacity,
                cardOpacity,
                uiScale
            }}
        />
        <TagModal
            isOpen={showTagModal}
            onClose={() => setShowTagModal(false)}
            onAddTag={addTagFromModal}
            pointIndex={pendingTagPointIndex}
            pointsCount={points.length}
        />
        <ExportModal
            isOpen={showExportModal}
            onClose={() => setShowExportModal(false)}
            onExport={handleExportWithName}
        />
        <div className="app-shell" ref={layoutRef} style={shellStyle}>
            <BuildPanel
                shapeType={shapeType}
                setShapeType={(type) => {
                    setShapeType(type);
                    setBezierTemp(null);
                    setArcTemp(null);
                    setDrawTemp(null);
                    setPreview(null);
                }}
                headingMode={headingMode}
                setHeadingMode={setHeadingMode}
                endHeading={endHeading}
                setEndHeading={setEndHeading}
                velocity={velocity}
                setVelocity={setVelocity}
                maxAccel={maxAccel}
                setMaxAccel={setMaxAccel}
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
                tagPointIndex={tagPointIndex}
                setTagPointIndex={setTagPointIndex}
                addTag={addTag}
                pointsLength={points.length}
                editMode={editMode}
                toggleEditMode={toggleEditMode}
                selectedPointIndices={selectedPointIndices}
                setSelectedPointIndices={setSelectedPointIndices}
                updatePoint={updatePoint}
                deletePoint={deletePoint}
                deletePoints={deletePoints}
                points={points}
                tags={tags}
                onRemoveTag={removeTag}
                onEditTag={editTag}
                onOpenSettings={() => setShowSetupModal(true)}
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
                    drawTemp={drawTemp}
                    setDrawTemp={setDrawTemp}
                    robot={robotDimensions}
                    livePose={livePose}
                    playState={playState}
                    playDist={playDist}
                    waypoints={waypoints}
                    previewMarker="dotArrow"
                    editMode={editMode}
                    selectedPointIndices={selectedPointIndices}
                    setSelectedPointIndices={setSelectedPointIndices}
                    updatePoint={updatePoint}
                    updatePoints={updatePoints}
                    deletePoints={deletePoints}
                    palette={palette}
                    fieldSize={fieldSize}
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
                onRun={doRun}
                uploadStatus={uploadStatus}
                runStatus={runStatus}
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
                onEditTag={editTag}
                onReorderTags={reorderTags}
                onAddTag={addTagFromRunPanel}
                estTimeSec={estRunTimeSeconds}
                onExportPath={onExportPath}
                onImportFile={onImportPath}
                points={points}
                onSwitchSides={switchSides}
                isConnected={isConnected}
                robotStatus={robotStatus}
                onInstantUploadInit={doInstantUploadInit}
                onInit={sendInit}
                onStart={sendStart}
                onStopOpMode={sendStop}
            />
        </div>
        </div>
    );
}
