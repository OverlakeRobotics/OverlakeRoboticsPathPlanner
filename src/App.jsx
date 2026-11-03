import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import "./App.css";

import CanvasStage from "./components/CanvasStage";
import BuildPanel from "./components/panels/BuildPanel";
import RunPanel from "./components/panels/RunPanel";
import ExportModal from "./components/ExportModal";
import SetupModal from "./components/SetupModal";
import {
    DEFAULT_CANVAS_SIZE,
    DEFAULT_MAX_ACCEL_IN_PER_S2,
    DEFAULT_ROBOT_DIMENSIONS,
    DEFAULT_SNAP_IN,
    DEFAULT_FIELD_IMAGE,
    DEFAULT_PLAYBACK_SPEED_IN_PER_S,
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
    TAG_TEMPLATES,
    DEFAULT_OP_MODE,
} from "./constants/config";
import {usePosePolling} from "./hooks/usePosePolling";
import {usePlayback} from "./hooks/usePlayback";
import {useTheme} from "./hooks/useTheme";
import {useRobotConnection} from "./hooks/useRobotConnection";
import {clamp, num, normDeg, shortestDeltaDeg, toFixed} from "./utils/math";
import {polylineLength} from "./utils/path";
import {buildArcSegment, buildBezierSegment, buildLineSegment, normalizeHeadingMode} from "./utils/segments";
import {getFieldImageSrc, resolveFieldImageKey} from "./constants/fieldImages";

const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeout = async (url, options = {}, timeoutMs = 4000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {...options, signal: controller.signal});
    } finally {
        clearTimeout(timer);
    }
};

const isNetworkError = (error) => {
    if (!error) return false;
    if (error.name === "AbortError") return true;
    if (typeof error.message === "string") {
        const lower = error.message.toLowerCase();
        return lower.includes("failed to fetch") || lower.includes("network request failed");
    }
    return false;
};

const PATH_SERVER_CHECK_ATTEMPTS = 4;
const PATH_SERVER_CHECK_DELAY_MS = 300;
const UPLOAD_REQUEST_TIMEOUT_MS = 4500;
const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_RETRY_DELAY_MS = 350;

function wrapAngleRad(a) {
    // wrap to (-Ï€, Ï€]
    let x = a % (2 * Math.PI);
    if (x <= -Math.PI) x += 2 * Math.PI;
    if (x > Math.PI) x -= 2 * Math.PI;
    return x;
}

// Slowest cruise the preview will model. A 0% velocity tag would otherwise
// make the estimate infinite.
const PREVIEW_MIN_SPEED_IN_S = 1;

const EMPTY_PROFILE = {
    s: [0], v: [0], t: [0], totalLen: 0, totalTime: 0, drivingTime: 0, stopTime: 0, sOfT: () => 0,
};

// Tags that hold the robot at their node for `value` seconds (`dwell: true` in config.js).
const isDwellTag = (name) => TAG_TEMPLATES.some((template) => template.name === name && template.dwell);

// Trapezoidal speed profile over the sampled path. Every waypoint edge has its
// own cruise cap (robot max speed scaled by the velocity tag in effect for its
// segment and by how much of the motion is a strafe), curvature limits speed
// through turns, and the forward/backward passes use the robot's acceleration
// and deceleration limits. The robot starts and ends at rest, and `stops`
// ([{waypoint, seconds}]) hold it at rest at a node for that long before it
// moves on, so the time axis includes the dwell and the ghost visibly waits.
function buildSpeedProfile(waypoints, {edgeCruise = [], fallbackCruise, accel, decel, stops = []} = {}) {
    const amax = Math.max(EPS, Number(accel) || 0);
    const dmax = Math.max(EPS, Number(decel) || amax);
    const fallback = Math.max(PREVIEW_MIN_SPEED_IN_S, Number(fallbackCruise) || 0);
    const cruiseFor = (edge) => {
        const cap = Number(edgeCruise[edge]);
        return Number.isFinite(cap) && cap > 0 ? Math.max(PREVIEW_MIN_SPEED_IN_S, cap) : fallback;
    };
    const N = waypoints.length;
    if (N < 2) return EMPTY_PROFILE;

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
    if (totalLen < EPS) return EMPTY_PROFILE;

    const kappaVertex = new Array(N).fill(0);
    for (let i = 1; i < N - 1; i++) {
        const turn = Math.abs(wrapAngleRad(segDir[i] - segDir[i - 1]));
        const dsLocal = Math.max(EPS, 0.5 * (segLen[i - 1] + segLen[i]));
        kappaVertex[i] = turn / dsLocal;
    }

    // Resample along arc length, remembering which edge each sample is on so
    // it picks up that edge's cruise cap.
    const s = [0];
    const kappa = [kappaVertex[0]];
    const edgeOf = [0];
    const sampleOfWaypoint = [0];
    let accS = 0;
    for (let i = 0; i < N - 1; i++) {
        const L = segLen[i];
        if (L < EPS) {
            sampleOfWaypoint.push(s.length - 1);
            continue;
        }
        const steps = Math.max(1, Math.round(L / SPEED_PROFILE_SAMPLE_STEP_IN));
        for (let j = 1; j <= steps; j++) {
            const alpha = j / steps;
            s.push(accS + alpha * L);
            kappa.push((1 - alpha) * kappaVertex[i] + alpha * kappaVertex[i + 1]);
            edgeOf.push(i);
        }
        sampleOfWaypoint.push(s.length - 1);
        accS += L;
    }
    const M = s.length;

    // Dwell per sample, from stops at waypoint nodes.
    const dwell = new Array(M).fill(0);
    stops.forEach((stop) => {
        const seconds = Number(stop?.seconds) || 0;
        const sample = sampleOfWaypoint[Math.trunc(Number(stop?.waypoint))];
        if (seconds <= 0 || !Number.isFinite(sample)) return;
        dwell[sample] += seconds;
    });

    const v = new Array(M);
    for (let i = 0; i < M; i++) {
        const k = Math.abs(kappa[i]);
        const vCurve = k < 1e-8 ? Infinity : Math.sqrt(Math.max(EPS, amax / k));
        v[i] = Math.min(cruiseFor(edgeOf[i]), vCurve);
    }
    v[0] = 0;
    v[M - 1] = 0;
    for (let i = 0; i < M; i++) {
        if (dwell[i] > 0) v[i] = 0; // stopped at the node, accelerates again after
    }

    for (let i = 1; i < M; i++) {
        const ds = s[i] - s[i - 1];
        v[i] = Math.min(v[i], Math.sqrt(v[i - 1] * v[i - 1] + 2 * amax * ds));
    }
    for (let i = M - 2; i >= 0; i--) {
        const ds = s[i + 1] - s[i];
        v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * dmax * ds));
    }

    // t = arrival time at each sample; the robot leaves at t + dwell.
    const t = new Array(M).fill(0);
    const tDepart = new Array(M).fill(0);
    tDepart[0] = dwell[0];
    for (let i = 1; i < M; i++) {
        const ds = s[i] - s[i - 1];
        const vAvg = Math.max(EPS, 0.5 * (v[i] + v[i - 1]));
        t[i] = tDepart[i - 1] + ds / vAvg;
        tDepart[i] = t[i] + dwell[i];
    }
    const totalTime = tDepart[M - 1];
    const stopTime = dwell.reduce((sum, d) => sum + d, 0);
    const drivingTime = Math.max(0, totalTime - stopTime);

    function sOfT(time) {
        if (time <= 0) return 0;
        if (time >= totalTime) return totalLen;
        // largest sample already reached
        let lo = 0, hi = M - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (t[mid] <= time) lo = mid;
            else hi = mid;
        }
        if (time < tDepart[lo] || lo === M - 1) return s[lo]; // holding at the node
        const dt = t[hi] - tDepart[lo];
        const alpha = dt > EPS ? (time - tDepart[lo]) / dt : 0;
        return s[lo] + alpha * (s[hi] - s[lo]);
    }

    return {s, v, t, totalLen, totalTime, drivingTime, stopTime, sOfT};
}

const cloneSegments = (segments) =>
    segments.map((segment) => ({
        ...segment,
        end: segment.end ? {...segment.end} : segment.end,
        control: segment.control ? {...segment.control} : segment.control,
        mid: segment.mid ? {...segment.mid} : segment.mid,
        samples: Array.isArray(segment.samples) ? segment.samples.map((sample) => ({...sample})) : segment.samples,
    }));

const cloneTags = (tags) => tags.map((tag) => ({...tag}));

const resolveTagValueWith = (tag, globalVars) => {
    if (tag?.globalName) {
        const match = globalVars.find((entry) => entry.name === tag.globalName);
        const resolved = Number(match?.value);
        if (Number.isFinite(resolved)) return resolved;
    }
    return Number(tag?.value) || 0;
};

// Tags are stored with a 1-based display-point index (0 = start pose). The
// "segment" a tag belongs to is the 0-based index of the segment whose end
// point it sits at; a start-pose tag is -1.
const tagSegmentIndex = (tagIndex, segmentCount) => {
    const parsed = Number(tagIndex);
    if (!Number.isFinite(parsed) || parsed <= 0 || segmentCount <= 0) return -1;
    return Math.min(segmentCount, Math.trunc(parsed)) - 1;
};

// "velocity" tag value -> percent of max speed, using the robot's rule:
// values above 1 are already percent, 0-1 is a legacy fraction.
const velocityTagPercent = (value) => {
    const n = Number(value) || 0;
    return clamp(n > 1 ? n : n * 100, 0, 100);
};

// Motion limits reported by the robot in GET /config (and echoed on POST
// /points) as {robot: {maxSpeedInS, maxStrafeSpeedInS, maxDecelInS2, maxAccelInS2|null}}.
const parseRobotLimits = (body) => {
    const raw = body?.robot;
    if (!raw || typeof raw !== "object") return null;
    const positive = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null);
    const maxSpeedInS = positive(raw.maxSpeedInS);
    if (!maxSpeedInS) return null;
    return {
        maxSpeedInS,
        maxStrafeSpeedInS: positive(raw.maxStrafeSpeedInS) ?? maxSpeedInS,
        maxDecelInS2: positive(raw.maxDecelInS2),
        maxAccelInS2: positive(raw.maxAccelInS2),
    };
};

const AUTOSAVE_KEY = "planner_path_v1";
const PATH_FILE_VERSION = 2;
const UPLOAD_PAYLOAD_VERSION = 2;

// Bring a version-1 path file (or an older autosave) up to the version-2 shape:
// the global velocity (in/s) and tolerance are gone, orth-left/orth-right
// heading modes collapse to tangent, and every segment carries an explicit
// headingMode. Tag "segment" indices are filled in later once the segments
// are normalized (see applyImportedData).
const migrateImportedData = (raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const data = {...raw};
    const version = Number(data.version) || 1;
    const hasFileHeadingMode = typeof data.headingMode === "string";
    const fileHeadingMode = hasFileHeadingMode ? normalizeHeadingMode(data.headingMode) : "straight";
    if (hasFileHeadingMode) data.headingMode = fileHeadingMode;
    delete data.velocity;
    delete data.tolerance;
    if (Array.isArray(data.segments)) {
        data.segments = data.segments.map((segment) => {
            if (!segment || typeof segment !== "object") return segment;
            const explicit = typeof segment.headingMode === "string";
            return {
                ...segment,
                headingMode: explicit ? normalizeHeadingMode(segment.headingMode) : fileHeadingMode,
            };
        });
    }
    data.version = Math.max(version, PATH_FILE_VERSION);
    return data;
};

const isTypingTarget = (element) =>
    Boolean(element) && (
        element.tagName === "INPUT" ||
        element.tagName === "TEXTAREA" ||
        element.tagName === "SELECT" ||
        element.isContentEditable
    );

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
    const [fieldSize, setFieldSize] = useState(FIELD_SIZE_IN);
    const [fieldImage, setFieldImage] = useState(resolveFieldImageKey(DEFAULT_FIELD_IMAGE));
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
    const [uiStyle, setUiStyle] = useState("glass");
    const [blurStrength, setBlurStrength] = useState(16);
    const [panelOpacity, setPanelOpacity] = useState(0.85);
    const [cardOpacity, setCardOpacity] = useState(0.6);
    const [uiScale, setUiScale] = useState(0.9);

    const [alliance, setAlliance] = useState("red");

    // Apply theme settings via hook
    useTheme({ blurStrength, panelOpacity, cardOpacity, uiScale, palette, themeName, uiStyle, alliance });

    useEffect(() => {
        const stored = localStorage.getItem("planner_settings");
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed.fieldSize) setFieldSize(parsed.fieldSize);
                if (parsed.fieldImage) setFieldImage(resolveFieldImageKey(parsed.fieldImage, DEFAULT_FIELD_IMAGE));
                if (Number(parsed.previewMaxSpeed) > 0) setPreviewMaxSpeed(String(Number(parsed.previewMaxSpeed)));
                if (Number(parsed.previewMaxAccel) > 0) setPreviewMaxAccel(String(Number(parsed.previewMaxAccel)));
                if (parsed.showGrid !== undefined) setShowGrid(Boolean(parsed.showGrid));
                if (Number.isFinite(Number(parsed.gridStep))) setGridStep(Number(parsed.gridStep));
                if (parsed.gridStepEntry !== undefined) setGridStepEntry(String(parsed.gridStepEntry));
                if (parsed.robotDimensions) setRobotDimensions({...DEFAULT_ROBOT_DIMENSIONS, ...parsed.robotDimensions});
                if (parsed.palette) setPalette(parsed.palette);
                if (parsed.themeName) setThemeName(parsed.themeName);
                if (parsed.uiStyle === "glass" || parsed.uiStyle === "matchday") setUiStyle(parsed.uiStyle);
                if (parsed.blurStrength !== undefined) setBlurStrength(parsed.blurStrength);
                if (parsed.panelOpacity !== undefined) setPanelOpacity(parsed.panelOpacity);
                if (parsed.cardOpacity !== undefined) setCardOpacity(parsed.cardOpacity);
                if (parsed.uiScale !== undefined) setUiScale(parsed.uiScale);
            } catch (e) {
                console.error("Failed to parse settings", e);
            }
        }
    }, []);

    const handleSaveSettings = (settings) => {
        setFieldSize(settings.fieldSize);
        setFieldImage(resolveFieldImageKey(settings.fieldImage, DEFAULT_FIELD_IMAGE));
        if (Number(settings.previewMaxSpeed) > 0) setPreviewMaxSpeed(String(Number(settings.previewMaxSpeed)));
        if (Number(settings.previewMaxAccel) > 0) setPreviewMaxAccel(String(Number(settings.previewMaxAccel)));
        setShowGrid(Boolean(settings.showGrid));
        setGridStep(Number(settings.gridStep) || GRID_DEFAULT_STEP);
        setGridStepEntry(settings.gridStepEntry ?? String(settings.gridStep ?? GRID_DEFAULT_STEP));
        setRobotDimensions({...DEFAULT_ROBOT_DIMENSIONS, ...settings.robotDimensions});
        setPalette(settings.palette);
        setThemeName(settings.themeName);
        setUiStyle(settings.uiStyle === "matchday" ? "matchday" : "glass");
        setBlurStrength(settings.blurStrength);
        setPanelOpacity(settings.panelOpacity);
        setCardOpacity(settings.cardOpacity);
        setUiScale(settings.uiScale);
        localStorage.setItem("planner_settings", JSON.stringify(settings));
    };

    const [startPose, setStartPose] = useState({x: 0, y: 0, h: 0});
    const [placeStart, setPlaceStart] = useState(false);

    const [segments, setSegmentsInternal] = useState([]);
    const [undoStack, setUndoStack] = useState([]);
    const [redoStack, setRedoStack] = useState([]);

    // Point editing state
    const [selectedPointIndices, setSelectedPointIndices] = useState([]); // Now an array for multi-selection
    const [editMode, setEditMode] = useState(false); // When true, enable point editing

    const setSegments = useCallback((updater) => {
        setSegmentsInternal((prev) => (typeof updater === 'function' ? updater(prev) : updater));
    }, []);

    const setSegmentsWithoutModal = useCallback((updater) => {
        setSegmentsInternal((prev) => (typeof updater === 'function' ? updater(prev) : updater));
    }, []);

    const [tags, setTags] = useState([]);
    const [tagName, setTagName] = useState("");
    const [tagValue, setTagValue] = useState("");
    const [tagPointIndex, setTagPointIndex] = useState(""); // Index for manual tag placement
    const [showExportModal, setShowExportModal] = useState(false);

    const [globalVars, setGlobalVars] = useState([]);
    const [tagValueSource, setTagValueSource] = useState("manual");
    const [tagGlobalName, setTagGlobalName] = useState("");
    const [expandedPointIndex, setExpandedPointIndex] = useState(null);

    const [shapeType, setShapeType] = useState("line");
    const [drawMode, setDrawMode] = useState("bezier");
    const [headingMode, setHeadingMode] = useState("straight");
    const [endHeading, setEndHeading] = useState(String(0));

    // Playback estimate inputs. The robot's own limits (from GET /config) win;
    // these Setup values are only the fallback when the robot is not connected.
    // Nothing here is uploaded or exported.
    const [previewMaxSpeed, setPreviewMaxSpeed] = useState(String(DEFAULT_PLAYBACK_SPEED_IN_PER_S));
    const [previewMaxAccel, setPreviewMaxAccel] = useState(String(DEFAULT_MAX_ACCEL_IN_PER_S2));
    const [robotLimits, setRobotLimits] = useState(null);
    const [snapInches, setSnapInches] = useState(String(DEFAULT_SNAP_IN));

    const [robotDimensions, setRobotDimensions] = useState({...DEFAULT_ROBOT_DIMENSIONS});

    const [showGrid, setShowGrid] = useState(true);
    const [gridStep, setGridStep] = useState(GRID_DEFAULT_STEP);
    const [gridStepEntry, setGridStepEntry] = useState(String(GRID_DEFAULT_STEP));

    const [preview, setPreview] = useState(null);
    const [bezierTemp, setBezierTemp] = useState(null);
    const [arcTemp, setArcTemp] = useState(null);
    const [drawTemp, setDrawTemp] = useState(null);

    const [copied, setCopied] = useState(false);
    const [uploadStatus, setUploadStatus] = useState("idle");
    const [runStatus, setRunStatus] = useState("idle");
    const [lastUpload, setLastUpload] = useState(null);
    const [importError, setImportError] = useState(null);
    const [pathRevision, setPathRevision] = useState(0);
    const pathRevisionRef = useRef(0);
    const uploadTimerRef = useRef(null);
    const runTimerRef = useRef(null);
    const undoRef = useRef(() => {});
    const redoRef = useRef(() => {});
    const undoSuspendRef = useRef(false);
    const restoredRef = useRef(false);

    const {
        isConnected,
        robotStatus,
        robotConfig,
        sendInit,
        sendStart,
        sendStop,
        livePose,
        waitForOpMode,
        checkPathServer
    } = useRobotConnection(HUB_IP);
    const robotState = robotStatus?.activeOpModeStatus || null;

    const robotLimitsSeqRef = useRef(0);
    const fetchRobotLimits = useCallback(async () => {
        const seq = ++robotLimitsSeqRef.current;
        try {
            const response = await fetchWithTimeout(`http://${HUB_IP}:8099/config`, {cache: "no-store"}, 2500);
            if (!response.ok) return null;
            const body = await response.json().catch(() => null);
            const limits = parseRobotLimits(body);
            if (limits && seq === robotLimitsSeqRef.current) setRobotLimits(limits);
            return limits;
        } catch {
            return null;
        }
    }, []);

    // The robot's motion limits drive the playback estimate. Fetch them when
    // the dashboard link comes up and whenever the OpMode state changes (the
    // path server only answers while an OpMode is INIT/RUNNING), keep the last
    // good values while connected, and drop them when the link goes away.
    useEffect(() => {
        if (!isConnected) {
            setRobotLimits(null);
            return;
        }
        fetchRobotLimits();
    }, [isConnected, robotState, fetchRobotLimits]);

    useEffect(() => {
        let cancelled = false;
        const img = new Image();
        img.onload = () => {
            if (!cancelled) setBackgroundImage(img);
        };
        img.src = getFieldImageSrc(fieldImage);
        return () => {
            cancelled = true;
        };
    }, [fieldImage]);

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

    const pathPoints = useMemo(
        () => segments.flatMap((segment) => segment.samples || []),
        [segments]
    );

    const segmentEndIndices = useMemo(() => {
        let cursor = -1;
        return segments.map((segment) => {
            cursor += segment.samples?.length || 0;
            return cursor;
        });
    }, [segments]);

    const displayPoints = useMemo(
        () => segmentEndIndices.map((index) => pathPoints[index]).filter(Boolean),
        [segmentEndIndices, pathPoints]
    );

    const waypoints = useMemo(
        () => [{x: num(startPose.x), y: num(startPose.y)}, ...pathPoints.map((p) => ({x: p.x, y: p.y}))],
        [startPose, pathPoints]
    );
    const totalLength = useMemo(() => polylineLength(waypoints), [waypoints]);
    const endHeadingValue = useMemo(() => normDeg(num(endHeading)), [endHeading]);

    const previewLimits = useMemo(() => {
        const fallbackSpeed = Math.max(PREVIEW_MIN_SPEED_IN_S, Number(previewMaxSpeed) || DEFAULT_PLAYBACK_SPEED_IN_PER_S);
        const fallbackAccel = Math.max(EPS, Number(previewMaxAccel) || DEFAULT_MAX_ACCEL_IN_PER_S2);
        if (robotLimits?.maxSpeedInS > 0) {
            const accel = robotLimits.maxAccelInS2 > 0 ? robotLimits.maxAccelInS2 : fallbackAccel;
            return {
                source: "robot",
                maxSpeed: robotLimits.maxSpeedInS,
                maxStrafe: robotLimits.maxStrafeSpeedInS > 0 ? robotLimits.maxStrafeSpeedInS : robotLimits.maxSpeedInS,
                accel,
                accelFromRobot: robotLimits.maxAccelInS2 > 0,
                // The robot's maxDecelInS2 is Pedro's coast-down figure, not active braking, so
                // never brake slower than we accelerate.
                decel: Math.max(robotLimits.maxDecelInS2 > 0 ? robotLimits.maxDecelInS2 : 0, accel),
            };
        }
        return {
            source: "fallback",
            maxSpeed: fallbackSpeed,
            maxStrafe: fallbackSpeed,
            accel: fallbackAccel,
            accelFromRobot: false,
            decel: fallbackAccel,
        };
    }, [robotLimits, previewMaxSpeed, previewMaxAccel]);

    // Percent of max speed in effect for each segment. Velocity tags fire when
    // the robot reaches the end of their segment, so a tag on segment i takes
    // effect from segment i+1; a start-pose tag (segment -1) applies from
    // segment 0. When two tags share a segment the later one in the list wins.
    const segmentSpeedPercents = useMemo(() => {
        const changes = new Map();
        tags.forEach((tag) => {
            if (String(tag.name || "").trim() !== "velocity") return;
            const from = tagSegmentIndex(tag.index, segments.length) + 1;
            changes.set(from, velocityTagPercent(resolveTagValueWith(tag, globalVars)));
        });
        let current = 100;
        return segments.map((_, index) => {
            if (changes.has(index)) current = changes.get(index);
            return current;
        });
    }, [tags, segments, globalVars]);

    // Cruise cap for every waypoint edge (waypoints[j] -> waypoints[j+1], which
    // ends at pathPoints[j]): the robot's max speed, pulled toward the strafe
    // limit as the travel direction turns away from the heading (an ellipse
    // between the two limits), then scaled by the segment's percent.
    const edgeCruiseSpeeds = useMemo(() => {
        const headings = [num(startPose.h), ...pathPoints.map((p) => num(p.h ?? 0))];
        const {maxSpeed, maxStrafe} = previewLimits;
        let segmentIndex = 0;
        return pathPoints.map((point, j) => {
            while (segmentIndex < segmentEndIndices.length - 1 && segmentEndIndices[segmentIndex] < j) segmentIndex += 1;
            const pct = segmentSpeedPercents[segmentIndex] ?? 100;
            const prev = waypoints[j];
            const dx = point.x - prev.x;
            const dy = point.y - prev.y;
            let cap = maxSpeed;
            if (maxStrafe !== maxSpeed && Math.hypot(dx, dy) > 1e-6) {
                const travelDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
                const headingDeg = normDeg(headings[j] + shortestDeltaDeg(headings[j], headings[j + 1]) / 2);
                const theta = (normDeg(travelDeg - headingDeg) * Math.PI) / 180;
                const along = Math.cos(theta) / maxSpeed;
                const across = Math.sin(theta) / maxStrafe;
                cap = 1 / Math.sqrt(along * along + across * across);
            }
            return cap * (pct / 100);
        });
    }, [pathPoints, waypoints, startPose.h, segmentEndIndices, segmentSpeedPercents, previewLimits]);

    // Stops the robot makes along the route: dwell tags hold
    // it for `value` seconds at their node, which is the end of the segment the
    // tag sits at (start-pose tags hold before the robot moves). Values resolve
    // through globals exactly as the upload does.
    const previewStops = useMemo(() => {
        const byWaypoint = new Map();
        tags.forEach((tag) => {
            const name = String(tag.name || "").trim();
            if (!isDwellTag(name)) return;
            const seconds = Math.max(0, resolveTagValueWith(tag, globalVars));
            if (seconds <= 0) return;
            const segment = tagSegmentIndex(tag.index, segments.length);
            const waypoint = segment < 0 ? 0 : (segmentEndIndices[segment] ?? -1) + 1;
            const entry = byWaypoint.get(waypoint) ?? {waypoint, point: segment + 1, seconds: 0, items: []};
            entry.seconds += seconds;
            entry.items.push({name, seconds});
            byWaypoint.set(waypoint, entry);
        });
        return [...byWaypoint.values()].sort((a, b) => a.waypoint - b.waypoint);
    }, [tags, globalVars, segments.length, segmentEndIndices]);

    const previewProfile = useMemo(
        () => buildSpeedProfile(waypoints, {
            edgeCruise: edgeCruiseSpeeds,
            fallbackCruise: previewLimits.maxSpeed,
            accel: previewLimits.accel,
            decel: previewLimits.decel,
            stops: previewStops,
        }),
        [waypoints, edgeCruiseSpeeds, previewLimits, previewStops]
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
    }, [segments, startPose.x, startPose.y, startPose.h, stopPlayback]);

    // Track path edits so the run panel can tell whether the robot's copy is stale.
    useEffect(() => {
        setPathRevision((prev) => {
            const next = prev + 1;
            pathRevisionRef.current = next;
            return next;
        });
    }, [segments, tags, startPose, alliance]);

    // Restore the working path after a refresh or crash.
    useEffect(() => {
        if (restoredRef.current) return;
        restoredRef.current = true;
        try {
            const stored = localStorage.getItem(AUTOSAVE_KEY);
            if (!stored) return;
            const data = JSON.parse(stored);
            if (Array.isArray(data?.segments) && data.segments.length) {
                applyImportedData(data);
            }
        } catch {
            localStorage.removeItem(AUTOSAVE_KEY);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Autosave the working path so a refresh never loses it.
    useEffect(() => {
        if (!restoredRef.current) return;
        const timer = setTimeout(() => {
            try {
                localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(buildSerializable()));
            } catch {
                // storage unavailable or full; nothing to do
            }
        }, 400);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [segments, tags, startPose, alliance, globalVars, endHeading, headingMode, snapInches]);

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
            return next;
        });
    };

    const selectShape = (type) => {
        setShapeType(type);
        setBezierTemp(null);
        setArcTemp(null);
        setDrawTemp(null);
        setPreview(null);
    };

    const clearAll = () => {
        if (segments.length || tags.length) recordUndoSnapshot(segments);
        setSegments([]);
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

    const captureSnapshot = useCallback((segmentsSnapshot) => ({
        type: "snapshot",
        segments: cloneSegments(segmentsSnapshot ?? segments),
        tags: cloneTags(tags),
        startPose: {...startPose},
        selectedPointIndices: [...selectedPointIndices],
        expandedPointIndex,
    }), [segments, tags, startPose, selectedPointIndices, expandedPointIndex]);

    const recordUndoSnapshot = useCallback((segmentsSnapshot) => {
        if (undoSuspendRef.current) return;
        setUndoStack((prev) => [...prev, captureSnapshot(segmentsSnapshot)]);
        setRedoStack([]);
    }, [captureSnapshot]);

    const beginEditAction = useCallback(() => {
        if (!undoSuspendRef.current) {
            recordUndoSnapshot(segments);
        }
        undoSuspendRef.current = true;
    }, [recordUndoSnapshot, segments]);

    const endEditAction = useCallback(() => {
        undoSuspendRef.current = false;
    }, []);

    const undoLast = useCallback(() => {
        if (bezierTemp) { setBezierTemp(null); setPreview(null); return; }
        if (arcTemp)    { setArcTemp(null);    setPreview(null); return; }
        if (undoStack.length === 0) return;
        setRedoStack((prev) => [...prev, captureSnapshot()]);
        const last = undoStack[undoStack.length - 1];
        if (last?.type === "snapshot") {
            setSegmentsInternal(cloneSegments(last.segments ?? []));
            setTags(cloneTags(last.tags ?? []));
            if (last.startPose) setStartPose(last.startPose);
            setSelectedPointIndices(last.selectedPointIndices ?? []);
            setExpandedPointIndex(last.expandedPointIndex ?? null);
            setUndoStack((prev) => prev.slice(0, -1));
            return;
        }
        const removeCount = Math.max(0, last?.count ?? 0);
        if (removeCount > 0) setSegments((prev) => prev.slice(0, Math.max(0, prev.length - removeCount)));
        setUndoStack((prev) => prev.slice(0, -1));
    }, [
        bezierTemp,
        arcTemp,
        undoStack,
        captureSnapshot,
        setSegments,
        setSegmentsInternal,
        setTags,
        setStartPose,
        setSelectedPointIndices,
        setExpandedPointIndex,
    ]);

    const redoLast = useCallback(() => {
        if (redoStack.length === 0) return;
        const snap = redoStack[redoStack.length - 1];
        setUndoStack((prev) => [...prev, captureSnapshot()]);
        setSegmentsInternal(cloneSegments(snap.segments ?? []));
        setTags(cloneTags(snap.tags ?? []));
        if (snap.startPose) setStartPose(snap.startPose);
        setSelectedPointIndices(snap.selectedPointIndices ?? []);
        setExpandedPointIndex(snap.expandedPointIndex ?? null);
        setRedoStack((prev) => prev.slice(0, -1));
    }, [redoStack, captureSnapshot]);

    useEffect(() => { undoRef.current = undoLast; }, [undoLast]);
    useEffect(() => { redoRef.current = redoLast; }, [redoLast]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            const isMac = navigator.platform.toLowerCase().includes("mac");
            const modifier = isMac ? event.metaKey : event.ctrlKey;
            const typing = isTypingTarget(event.target);
            if (modifier && !event.altKey && event.key.toLowerCase() === "z") {
                if (typing) return;
                event.preventDefault();
                if (event.shiftKey) redoRef.current();
                else undoRef.current();
                return;
            }
            if (modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "y") {
                if (typing) return;
                event.preventDefault();
                redoRef.current();
                return;
            }
            if (typing || modifier || event.altKey) return;
            const key = event.key.toLowerCase();
            if (key === "delete" || key === "backspace") {
                if (editMode && selectedPointIndices.length) {
                    event.preventDefault();
                    deletePoints(selectedPointIndices);
                }
                return;
            }
            if (key === "l") selectShape("line");
            else if (key === "d") selectShape("draw");
            else if (key === "b") selectShape("bezier");
            else if (key === "a") selectShape("arc");
            else if (key === "e") toggleEditMode();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    });

    const addTag = () => {
        if (displayPoints.length === 0) return;
        const name = (tagName ?? "").trim();
        if (!name) return;
        const value = Number(tagValue) || 0;
        const globalName = tagValueSource === "global" ? (tagGlobalName || "").trim() : "";
        const targetIndex = Math.max(1, Math.min(displayPoints.length, Number(tagPointIndex) || displayPoints.length));
        setTags((prev) => [...prev, {index: targetIndex, name, value, globalName: globalName || undefined}]);
        setTagName("");
        setTagValue("");
        setTagPointIndex("");
        setTagValueSource("manual");
        setTagGlobalName("");
    };

    const addTagFromModal = (name, value, pointIndex, globalName) => {
        setTags((prev) => [...prev, {index: pointIndex, name, value, globalName: globalName || undefined}]);
    };

    const addTagFromRunPanel = (name, value, pointIndex, globalName) => {
        setTags((prev) => [...prev, {index: pointIndex, name, value, globalName: globalName || undefined}]);
    };

    const removeTag = (index) => setTags((prev) => prev.filter((_, i) => i !== index));

    const editTag = (index, name, value, pointIndex, globalName) => {
        setTags((prev) => {
            const updated = [...prev];
            const existing = updated[index] || {};
            const resolvedGlobal = globalName === undefined ? existing.globalName : globalName || undefined;
            updated[index] = { name, value, index: pointIndex, globalName: resolvedGlobal };
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

    const resolveTagValue = (tag) => resolveTagValueWith(tag, globalVars);

    // Upload/export "segment" field for a tag (see tagSegmentIndex).
    const resolveTagSegmentIndex = (tagIndex) => tagSegmentIndex(tagIndex, segments.length);

    const serializeTags = () => tags.map((tag) => ({
        index: resolveSegmentEndIndex(tag.index),
        segment: resolveTagSegmentIndex(tag.index),
        name: String(tag.name || ""),
        value: resolveTagValue(tag),
    }));

    // Heading mode is resolved per segment; the global picker only seeds new
    // segments, so this fallback is for segments built before it was stamped.
    const resolveSegmentHeadingMode = (segment) => normalizeHeadingMode(segment?.headingMode, headingMode);

    const serializeSegments = () => segments.map((segment) => ({
        type: segment.type,
        headingMode: resolveSegmentHeadingMode(segment),
        end: segment.end ? {x: Number(segment.end.x), y: Number(segment.end.y), h: Number(segment.end.h ?? 0)} : undefined,
        control: segment.control ? {x: Number(segment.control.x), y: Number(segment.control.y)} : undefined,
        mid: segment.mid ? {x: Number(segment.mid.x), y: Number(segment.mid.y)} : undefined,
        samples: Array.isArray(segment.samples)
            ? segment.samples.map((sample) => ({
                x: Number(sample.x),
                y: Number(sample.y),
                h: Number(sample.h ?? 0),
            }))
            : [],
    }));

    const resolveSegmentEndIndex = (segmentIndex) => {
        const parsed = Number(segmentIndex);
        if (!Number.isFinite(parsed) || parsed <= 0) return 0;
        const idx = Math.min(segmentEndIndices.length, parsed);
        const endIndex = segmentEndIndices[idx - 1];
        return Number.isFinite(endIndex) ? endIndex + 1 : 0;
    };

    const addGlobalVar = (name, value) => {
        const cleaned = (name || "").trim();
        if (!cleaned) return;
        const numeric = Number(value);
        setGlobalVars((prev) => {
            const exists = prev.find((entry) => entry.name === cleaned);
            if (exists) {
                return prev.map((entry) =>
                    entry.name === cleaned ? {...entry, value: Number.isFinite(numeric) ? numeric : entry.value} : entry
                );
            }
            return [...prev, {name: cleaned, value: Number.isFinite(numeric) ? numeric : 0}];
        });
    };

    const updateGlobalVar = (name, value) => {
        const numeric = Number(value);
        setGlobalVars((prev) =>
            prev.map((entry) =>
                entry.name === name
                    ? {...entry, value: Number.isFinite(numeric) ? numeric : entry.value}
                    : entry
            )
        );
    };

    const removeGlobalVar = (name) => {
        setTags((prev) =>
            prev.map((tag) =>
                tag.globalName === name ? {...tag, value: resolveTagValue(tag), globalName: undefined} : tag
            )
        );
        setGlobalVars((prev) => prev.filter((entry) => entry.name !== name));
    };

    const rebuildSegments = useCallback((segmentsList) => {
        let anchor = {x: num(startPose.x), y: num(startPose.y), h: num(startPose.h)};
        return segmentsList.map((segment) => {
            const resolvedHeadingMode = normalizeHeadingMode(segment.headingMode, headingMode);
            const end = {
                x: Number(segment.end?.x ?? anchor.x),
                y: Number(segment.end?.y ?? anchor.y),
            };
            const allowHeadingOverride = segment.type === "line" || resolvedHeadingMode === "straight";
            const endHeadingOverride = allowHeadingOverride && Number.isFinite(Number(segment.end?.h))
                ? Number(segment.end.h)
                : undefined;
            let rebuilt;
            if (segment.type === "bezier" && segment.control) {
                rebuilt = buildBezierSegment({
                    anchor,
                    control: segment.control,
                    end,
                    headingMode: resolvedHeadingMode,
                    endHeading: endHeadingValue,
                    endHeadingOverride,
                });
            } else if (segment.type === "arc" && segment.mid) {
                rebuilt = buildArcSegment({
                    anchor,
                    mid: segment.mid,
                    end,
                    headingMode: resolvedHeadingMode,
                    endHeading: endHeadingValue,
                    endHeadingOverride,
                });
            } else {
                rebuilt = buildLineSegment({
                    anchor,
                    end,
                    headingMode: resolvedHeadingMode,
                    endHeading: endHeadingValue,
                    endHeadingOverride,
                });
            }
            anchor = rebuilt.end;
            return rebuilt;
        });
    }, [startPose, headingMode, endHeadingValue]);

    const appendLineSegment = useCallback((x, y) => {
        const anchor = segments.length
            ? segments[segments.length - 1].samples?.[segments[segments.length - 1].samples.length - 1]
            : {x: num(startPose.x), y: num(startPose.y), h: num(startPose.h)};
        // Ignore clicks on top of the current anchor: a zero-length segment
        // would upload a degenerate waypoint.
        if (anchor && Math.hypot(x - Number(anchor.x ?? 0), y - Number(anchor.y ?? 0)) < 0.05) return;
        const seg = buildLineSegment({
            anchor,
            end: {x, y},
            headingMode,
            endHeading: endHeadingValue,
        });
        setSegments((prev) => [...prev, seg]);
        setUndoStack((prev) => [...prev, {type: "point", count: 1}]);
        setRedoStack([]);
    }, [segments, setSegments, headingMode, endHeadingValue, startPose]);

    const appendBezierSegment = useCallback((control, end) => {
        setSegments((prev) => {
            const anchor = prev.length
                ? prev[prev.length - 1].samples?.[prev[prev.length - 1].samples.length - 1]
                : {x: num(startPose.x), y: num(startPose.y), h: num(startPose.h)};
            const seg = buildBezierSegment({
                anchor,
                control,
                end,
                headingMode,
                endHeading: endHeadingValue,
            });
            return [...prev, seg];
        });
        setUndoStack((prev) => [...prev, {type: "bezier", count: 1}]);
        setRedoStack([]);
    }, [setSegments, headingMode, endHeadingValue, startPose]);

    const appendArcSegment = useCallback((mid, end) => {
        setSegments((prev) => {
            const anchor = prev.length
                ? prev[prev.length - 1].samples?.[prev[prev.length - 1].samples.length - 1]
                : {x: num(startPose.x), y: num(startPose.y), h: num(startPose.h)};
            const seg = buildArcSegment({
                anchor,
                mid,
                end,
                headingMode,
                endHeading: endHeadingValue,
            });
            return [...prev, seg];
        });
        setUndoStack((prev) => [...prev, {type: "arc", count: 1}]);
        setRedoStack([]);
    }, [setSegments, headingMode, endHeadingValue, startPose]);

    const appendSegmentsFromSamples = useCallback((samples, shapeType = "draw") => {
        if (!samples?.length) return;
        setSegments((prev) => {
            const next = [...prev];
            let anchor = prev.length
                ? prev[prev.length - 1].samples?.[prev[prev.length - 1].samples.length - 1]
                : {x: num(startPose.x), y: num(startPose.y), h: num(startPose.h)};
            samples.forEach((sample) => {
                const seg = buildLineSegment({
                    anchor,
                    end: {x: sample.x, y: sample.y},
                    headingMode,
                    endHeading: endHeadingValue,
                });
                next.push(seg);
                anchor = seg.end;
            });
            return next;
        });
        setUndoStack((prev) => [...prev, {type: shapeType, count: samples.length}]);
        setRedoStack([]);
    }, [setSegments, headingMode, endHeadingValue, startPose]);

    // Point editing functions (segment endpoints)
    const updateStartPose = useCallback((updates) => {
        recordUndoSnapshot(segments);
        setStartPose((prev) => ({
            ...prev,
            x: updates.x !== undefined ? Number(updates.x) : prev.x,
            y: updates.y !== undefined ? Number(updates.y) : prev.y,
            h: updates.h !== undefined ? normDeg(Number(updates.h)) : prev.h,
        }));
    }, [recordUndoSnapshot, segments]);

    const updatePoint = (index, updates) => {
        recordUndoSnapshot(segments);
        setSegments((prev) => {
            const next = prev.map((segment) => ({...segment, end: {...segment.end}}));
            const target = next[index];
            if (!target) return prev;
            const nextEnd = {
                x: updates.x !== undefined ? Number(updates.x) : Number(target.end?.x ?? 0),
                y: updates.y !== undefined ? Number(updates.y) : Number(target.end?.y ?? 0),
                h: updates.h !== undefined ? Number(updates.h) : Number(target.end?.h ?? 0),
            };
            next[index] = {...target, end: nextEnd};
            return rebuildSegments(next);
        });
    };

    const updateSegmentControl = (index, updates) => {
        recordUndoSnapshot(segments);
        setSegments((prev) => {
            const next = prev.map((segment) => ({...segment, control: segment.control ? {...segment.control} : segment.control}));
            const target = next[index];
            if (!target || target.type !== "bezier") return prev;
            const control = {
                x: updates.x !== undefined ? Number(updates.x) : Number(target.control?.x ?? 0),
                y: updates.y !== undefined ? Number(updates.y) : Number(target.control?.y ?? 0),
            };
            next[index] = {...target, control};
            return rebuildSegments(next);
        });
    };

    const updateSegmentMid = (index, updates) => {
        recordUndoSnapshot(segments);
        setSegments((prev) => {
            const next = prev.map((segment) => ({...segment, mid: segment.mid ? {...segment.mid} : segment.mid}));
            const target = next[index];
            if (!target || target.type !== "arc") return prev;
            const mid = {
                x: updates.x !== undefined ? Number(updates.x) : Number(target.mid?.x ?? 0),
                y: updates.y !== undefined ? Number(updates.y) : Number(target.mid?.y ?? 0),
            };
            next[index] = {...target, mid};
            return rebuildSegments(next);
        });
    };

    const updateSegmentHeadingMode = (index, mode) => {
        recordUndoSnapshot(segments);
        setSegments((prev) => {
            const next = prev.map((segment) => ({...segment}));
            const target = next[index];
            if (!target || (target.type !== "bezier" && target.type !== "arc")) return prev;
            const resolvedMode = normalizeHeadingMode(mode);
            const nextEnd = {...target.end};
            if (resolvedMode === "straight") {
                nextEnd.h = Number.isFinite(Number(nextEnd?.h)) ? Number(nextEnd.h) : endHeadingValue;
            }
            next[index] = {...target, headingMode: resolvedMode, end: nextEnd};
            return rebuildSegments(next);
        });
    };

    // Update multiple points at once (for multi-selection drag)
    const updatePoints = (indices, deltaX, deltaY) => {
        recordUndoSnapshot(segments);
        setSegments((prev) => {
            const next = prev.map((segment) => ({...segment, end: {...segment.end}}));
            indices.forEach((index) => {
                if (!next[index]) return;
                next[index].end = {
                    ...next[index].end,
                    x: Number(next[index].end?.x ?? 0) + deltaX,
                    y: Number(next[index].end?.y ?? 0) + deltaY,
                };
            });
            return rebuildSegments(next);
        });
    };

    const deletePoint = (index) => {
        recordUndoSnapshot(segments);
        setSegments((prev) => rebuildSegments(prev.filter((_, i) => i !== index)));
        setSelectedPointIndices((prev) => prev.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)));
        setExpandedPointIndex((prev) => {
            if (prev === null) return prev;
            if (prev === index) return null;
            if (prev > index) return prev - 1;
            return prev;
        });
        setTags((prev) =>
            prev
                .filter((tag) => tag.index !== index + 1)
                .map((tag) => (tag.index > index + 1 ? {...tag, index: tag.index - 1} : tag))
        );
    };

    // Delete multiple selected points
    const deletePoints = (indices) => {
        if (!indices?.length) return;
        recordUndoSnapshot(segments);
        const sortedIndices = [...indices].sort((a, b) => b - a);
        setSegments((prev) => rebuildSegments(prev.filter((_, i) => !indices.includes(i))));
        setSelectedPointIndices([]);
        setExpandedPointIndex(null);
        setTags((prev) => {
            let updatedTags = [...prev];
            sortedIndices.forEach((index) => {
                updatedTags = updatedTags
                    .filter((tag) => tag.index !== index + 1)
                    .map((tag) => (tag.index > index + 1 ? {...tag, index: tag.index - 1} : tag));
            });
            return updatedTags;
        });
    };

    const reorderPoints = (fromIndex, toIndex) => {
        if (fromIndex === toIndex) return;
        recordUndoSnapshot(segments);
        setSegmentsInternal((prev) => {
            const next = [...prev];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            return rebuildSegments(next);
        });
        setTags((prev) =>
            prev.map((tag) => {
                const oldIdx = (Number(tag.index) || 0) - 1;
                let newIdx = oldIdx;
                if (oldIdx === fromIndex) {
                    newIdx = toIndex;
                } else if (fromIndex < toIndex && oldIdx > fromIndex && oldIdx <= toIndex) {
                    newIdx = oldIdx - 1;
                } else if (toIndex < fromIndex && oldIdx >= toIndex && oldIdx < fromIndex) {
                    newIdx = oldIdx + 1;
                }
                return {...tag, index: newIdx + 1};
            })
        );
        setSelectedPointIndices((prev) =>
            prev.map((idx) => {
                if (idx === fromIndex) return toIndex;
                if (fromIndex < toIndex && idx > fromIndex && idx <= toIndex) return idx - 1;
                if (toIndex < fromIndex && idx >= toIndex && idx < fromIndex) return idx + 1;
                return idx;
            })
        );
        setExpandedPointIndex((prev) => {
            if (prev === null) return prev;
            if (prev === fromIndex) return toIndex;
            if (fromIndex < toIndex && prev > fromIndex && prev <= toIndex) return prev - 1;
            if (toIndex < fromIndex && prev >= toIndex && prev < fromIndex) return prev + 1;
            return prev;
        });
    };

    const togglePointExpansion = (index) => {
        setExpandedPointIndex((prev) => {
            if (index === null || index === undefined) {
                setSelectedPointIndices([]);
                return null;
            }
            if (index === -1) {
                setSelectedPointIndices([]);
                return prev === -1 ? null : -1;
            }
            const next = prev === index ? null : index;
            setSelectedPointIndices(next === null ? [] : [index]);
            return next;
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
        // Also toggle the alliance parameter.
        setAlliance((prev) => (prev === "red" ? "blue" : "red"));

        // Mirror start pose
        setStartPose((prev) => {
            const newH = -prev.h; // Flip heading vertically
            return {
                ...prev,
                y: -prev.y,
                h: normDeg(newH), // Mirror heading angle and normalize
            };
        });

        // Mirror all segments
        setSegmentsWithoutModal((prev) => rebuildSegments(prev.map((segment) => {
            const next = {...segment};
            if (segment.end) {
                const newH = segment.end.h !== undefined ? -segment.end.h : undefined;
                next.end = {
                    ...segment.end,
                    y: -segment.end.y,
                    h: newH !== undefined ? normDeg(newH) : undefined,
                };
            }
            if (segment.control) {
                next.control = {...segment.control, y: -segment.control.y};
            }
            if (segment.mid) {
                next.mid = {...segment.mid, y: -segment.mid.y};
            }
            return next;
        })));

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

    const doUpload = async (targetOpMode = DEFAULT_OP_MODE) => {
        if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
        setUploadStatus("sending");
        const payload = {
            version: UPLOAD_PAYLOAD_VERSION,
            start: [num(startPose.x), num(startPose.y), num(startPose.h)],
            points: pathPoints.map((p) => [Number(p.x), Number(p.y), Number(p.h ?? 0)]),
            alliance,
            segments: serializeSegments(),
            tags: serializeTags(),
        };
        const pathServerReady = await (async () => {
            if (typeof checkPathServer !== "function") return true;
            for (let attempt = 0; attempt < PATH_SERVER_CHECK_ATTEMPTS; attempt += 1) {
                const reachable = await checkPathServer({timeoutMs: 1200});
                if (reachable) return true;
                await sleep(PATH_SERVER_CHECK_DELAY_MS);
            }
            return false;
        })();

        if (!pathServerReady) {
            setUploadStatus("fail");
            uploadTimerRef.current = setTimeout(() => setUploadStatus("idle"), UPLOAD_RESET_FAIL_MS);
            setLastUpload({
                state: "fail",
                reason: `${targetOpMode} isn't running the Path Server — pick a compatible OpMode.`,
                at: Date.now(),
            });
            const incompatErr = new Error(`${targetOpMode} does not expose a path server`);
            incompatErr.code = "PATH_SERVER_UNAVAILABLE";
            incompatErr.opModeName = targetOpMode;
            throw incompatErr;
        }

        let lastError = null;
        for (let attempt = 0; attempt < UPLOAD_MAX_ATTEMPTS; attempt += 1) {
            try {
                const response = await fetchWithTimeout(`http://${HUB_IP}:8099/points`, {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(payload),
                }, UPLOAD_REQUEST_TIMEOUT_MS);
                if (!response.ok) {
                    const httpErr = new Error(`Upload failed with status ${response.status}`);
                    httpErr.code = "PATH_UPLOAD_HTTP_ERROR";
                    httpErr.status = response.status;
                    throw httpErr;
                }
                const responseBody = await response.json().catch(() => null);
                const limitsFromUpload = parseRobotLimits(responseBody);
                if (limitsFromUpload) setRobotLimits(limitsFromUpload);
                fetchRobotLimits();
                setUploadStatus("ok");
                uploadTimerRef.current = setTimeout(() => setUploadStatus("idle"), UPLOAD_RESET_OK_MS);
                setLastUpload({
                    state: "ok",
                    opMode: targetOpMode,
                    points: displayPoints.length,
                    length: totalLength,
                    at: Date.now(),
                    revision: pathRevisionRef.current,
                });
                return true;
            } catch (error) {
                lastError = error;
                const shouldRetry = attempt < UPLOAD_MAX_ATTEMPTS - 1 && isNetworkError(error);
                if (shouldRetry) {
                    await sleep(UPLOAD_RETRY_DELAY_MS);
                    continue;
                }
                setUploadStatus("fail");
                uploadTimerRef.current = setTimeout(() => setUploadStatus("idle"), UPLOAD_RESET_FAIL_MS);
                setLastUpload({
                    state: "fail",
                    reason: isNetworkError(error)
                        ? "Robot unreachable — check the robot WiFi connection."
                        : error?.code === "PATH_UPLOAD_HTTP_ERROR"
                            ? `Robot rejected the upload (HTTP ${error.status}).`
                            : "Upload failed — see the browser console for details.",
                    at: Date.now(),
                });
                throw error;
            }
        }
        throw lastError || new Error("Unknown upload error");
    };

    const doInstantUploadInit = async (targetOpMode = DEFAULT_OP_MODE) => {
        // First request the robot to init the Path Planner op mode, then upload once the robot reports the op mode.
        try {
            setUploadStatus("sending");

            const MAX_INIT_ATTEMPTS = 2;
            let initOk = false;
            let lastInitError = null;

            for (let attempt = 1; attempt <= MAX_INIT_ATTEMPTS; attempt += 1) {
                try {
                    // Ensure the INIT message is actually sent (sendInit now returns a promise)
                    await sendInit(targetOpMode);

                    try {
                        await waitForOpMode(targetOpMode, 6000);
                        initOk = true;
                        break;
                    } catch (err) {
                        lastInitError = err;
                        // allow retry
                        await sleep(500);
                    }
                } catch (err) {
                    lastInitError = err;
                    await sleep(500);
                }
            }

            if (!initOk) {
                setUploadStatus("fail");
                uploadTimerRef.current = setTimeout(() => setUploadStatus("idle"), UPLOAD_RESET_FAIL_MS);
                setLastUpload({
                    state: "fail",
                    reason: `${targetOpMode} never initialized — is the robot on and connected?`,
                    at: Date.now(),
                });
                return;
            }

            // Now perform the upload
            await doUpload(targetOpMode);
        } catch (e) {
            // doUpload and other failures already set status; ensure it's marked
            setUploadStatus((s) => (s === "sending" ? "fail" : s));
        }
    };

    const doRun = () => {
        if (runTimerRef.current) clearTimeout(runTimerRef.current);
        setRunStatus("sending");
        fetch(`http://${HUB_IP}:8099/run`, {
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
            ...pathPoints
                .map((p) => ({x: toFixed(p.x), y: toFixed(p.y), h: toFixed(num(p.h ?? 0))}))
                .map((p) => `    new Pose2D(DistanceUnit.INCH, ${p.x}, ${p.y}, AngleUnit.DEGREES, ${p.h})`),
        ].join(",\n");
        const tagsBlock = tags
            .map((tag) => `    new Tag("${(tag.name ?? "").replace(/"/g, '\\"')}", ${resolveTagValue(tag)}, ${Number(tag.index) || 0})`)
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
};`;
    }, [pathPoints, startPose, tags, globalVars]);

    const buildSerializable = () => ({
        version: PATH_FILE_VERSION,
        createdAt: new Date().toISOString(),
        alliance,
        start: {x: num(startPose.x), y: num(startPose.y), h: num(startPose.h)},
        points: pathPoints.map((p) => ({x: Number(p.x), y: Number(p.y), h: Number(p.h ?? 0)})),
        segments: serializeSegments(),
        headingMode,
        endHeading: endHeadingValue,
        snapInches: Number(snapInches) || 0,
        robot: {...robotDimensions},
        tags: serializeTags(),
        globals: globalVars.map((entry) => ({name: entry.name, value: Number(entry.value) || 0})),
        tagBindings: tags
            .map((tag, idx) => (tag.globalName ? {tagIndex: idx, globalName: tag.globalName} : null))
            .filter(Boolean),
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

    const applyImportedData = (rawData) => {
            const data = migrateImportedData(rawData);
            const getNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
            const computeEndIndices = (segmentsList) => {
                let cursor = -1;
                return segmentsList.map((segment) => {
                    cursor += segment.samples?.length || 0;
                    return cursor;
                });
            };
            let importedSegments = null;

            if (data.start) {
                if (Array.isArray(data.start)) {
                    setStartPose({x: getNum(data.start[0]), y: getNum(data.start[1]), h: normDeg(getNum(data.start[2]))});
                } else {
                    setStartPose({x: getNum(data.start.x), y: getNum(data.start.y), h: normDeg(getNum(data.start.h))});
                }
            }
            const normalizeSegments = (segmentList) => {
                if (!Array.isArray(segmentList)) return [];
                return segmentList.map((segment) => {
                    const type = typeof segment.type === "string" ? segment.type : "line";
                    const headingModeOverride = normalizeHeadingMode(segment.headingMode, data.headingMode);
                    const end = segment.end ?? {};
                    const rawSamples = Array.isArray(segment.samples) ? segment.samples : [];
                    const samples = rawSamples
                        .map((sample) => ({
                            x: getNum(sample.x),
                            y: getNum(sample.y),
                            h: normDeg(getNum(sample.h)),
                        }))
                        .filter((sample) => Number.isFinite(sample.x) && Number.isFinite(sample.y));
                    const endPoint = samples.length
                        ? samples[samples.length - 1]
                        : {
                            x: getNum(end.x),
                            y: getNum(end.y),
                            h: normDeg(getNum(end.h)),
                        };
                    if (!Number.isFinite(endPoint.x) || !Number.isFinite(endPoint.y)) return null;
                    return {
                        type,
                        headingMode: headingModeOverride,
                        end: {x: endPoint.x, y: endPoint.y, h: endPoint.h},
                        control: segment.control ? {x: getNum(segment.control.x), y: getNum(segment.control.y)} : undefined,
                        mid: segment.mid ? {x: getNum(segment.mid.x), y: getNum(segment.mid.y)} : undefined,
                        samples: samples.length ? samples : [{...endPoint}],
                    };
                }).filter(Boolean);
            };

            if (Array.isArray(data.segments) && data.segments.length) {
                importedSegments = normalizeSegments(data.segments);
                if (importedSegments.length) {
                    setSegmentsWithoutModal(importedSegments);
                }
            } else if (Array.isArray(data.points)) {
                const pts = data.points.map((p) =>
                    Array.isArray(p) ? {x: getNum(p[0]), y: getNum(p[1]), h: normDeg(getNum(p[2]))} :
                        {x: getNum(p.x), y: getNum(p.y), h: normDeg(getNum(p.h))}
                );
                importedSegments = pts
                    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
                    .map((point) => ({
                        type: "line",
                        headingMode: normalizeHeadingMode(data.headingMode),
                        end: {x: point.x, y: point.y, h: point.h},
                        samples: [{x: point.x, y: point.y, h: point.h}],
                    }));
                setSegmentsWithoutModal(importedSegments);
            }
            if (typeof data.headingMode === "string") setHeadingMode(normalizeHeadingMode(data.headingMode));
            if (Number.isFinite(Number(data.endHeading))) setEndHeading(String(Number(data.endHeading)));
            // Older files carried velocity/maxAccel/tolerance; the playback
            // estimate now comes from the robot (or Setup), so they are ignored.
            if (Number.isFinite(Number(data.snapInches))) setSnapInches(String(Number(data.snapInches)));
            if (data.robot && typeof data.robot === "object") setRobotDimensions({...robotDimensions, ...data.robot});
            if (Array.isArray(data.globals)) {
                setGlobalVars(data.globals.map((entry) => ({
                    name: String(entry.name || ""),
                    value: getNum(entry.value),
                })).filter((entry) => entry.name));
            }
            if (Array.isArray(data.tags)) {
                let importedTags = data.tags.map((t) => ({
                    index: getNum(t.index),
                    segment: Number.isFinite(Number(t.segment)) ? Math.trunc(Number(t.segment)) : undefined,
                    name: String(t.name || ""),
                    value: getNum(t.value),
                }));
                if (importedSegments?.length) {
                    const endIndices = computeEndIndices(importedSegments);
                    const segmentCount = importedSegments.length;
                    importedTags = importedTags.map((tag) => {
                        // Version 2 files name the segment directly; the
                        // expanded point index is only a fallback for v1 files.
                        if (tag.segment !== undefined) {
                            const resolved = tag.segment < 0 ? 0 : Math.min(segmentCount, tag.segment + 1);
                            return {...tag, index: resolved};
                        }
                        const expandedIndex = getNum(tag.index);
                        if (!Number.isFinite(expandedIndex) || expandedIndex <= 0) return tag;
                        let segmentIndex = endIndices.findIndex((endIndex) => endIndex + 1 === expandedIndex);
                        if (segmentIndex < 0) {
                            segmentIndex = endIndices.findIndex((endIndex) => endIndex + 1 >= expandedIndex);
                        }
                        const resolved = segmentIndex >= 0 ? segmentIndex + 1 : Math.max(1, endIndices.length);
                        return {...tag, index: resolved};
                    });
                }
                // "segment" is derived from index on export; keep state tags lean.
                importedTags = importedTags.map((tag) => {
                    const cleaned = {...tag};
                    delete cleaned.segment;
                    return cleaned;
                });
                if (Array.isArray(data.tagBindings)) {
                    data.tagBindings.forEach((binding) => {
                        const tagIndex = getNum(binding.tagIndex, -1);
                        const globalName = String(binding.globalName || "").trim();
                        if (tagIndex >= 0 && tagIndex < importedTags.length && globalName) {
                            importedTags[tagIndex] = {...importedTags[tagIndex], globalName};
                        }
                    });
                }
                setTags(importedTags);
            }

            if (typeof data.alliance === "string") {
                const normalized = data.alliance.toLowerCase();
                if (normalized === "red" || normalized === "blue") {
                    setAlliance(normalized);
                }
            }
            setBezierTemp(null);
            setArcTemp(null);
            setPreview(null);
            setUndoStack([]);
            setRedoStack([]);
            setPlaceStart(false);
            stopPlayback();
    };

    const onImportPath = async (file) => {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            applyImportedData(data);
            setImportError(null);
        } catch (err) {
            console.error("Failed to import path:", err);
            setImportError(`"${file?.name ?? "That file"}" isn't a valid path JSON — export a path from the planner to see the expected format.`);
        }
    };

    const handleTogglePlay = () => {
        if (!pathPoints.length || totalLength <= 0) return;
        togglePlay();
    };

    const handleStop = () => {
        stopPlayback();
        setPlayTime(0); // reset "time"
    };

    const estRunTimeSeconds = previewProfile.totalTime;
    const estTimeBreakdown = useMemo(() => ({
        driving: previewProfile.drivingTime,
        stopped: previewProfile.stopTime,
        stops: previewStops,
    }), [previewProfile, previewStops]);

    const setupInitialSettings = useMemo(() => ({
        fieldSize,
        fieldImage,
        previewMaxSpeed,
        previewMaxAccel,
        showGrid,
        gridStep,
        gridStepEntry,
        robotDimensions,
        palette,
        themeName,
        uiStyle,
        blurStrength,
        panelOpacity,
        cardOpacity,
        uiScale,
    }), [fieldSize, fieldImage, previewMaxSpeed, previewMaxAccel, showGrid, gridStep, gridStepEntry, robotDimensions, palette, themeName, uiStyle, blurStrength, panelOpacity, cardOpacity, uiScale]);

    const exportDefaultName = `${alliance}_path_${new Date().toISOString().slice(0, 10)}`;

    return (
        <div className="app-scale">
        <div className={`app-root${uiStyle === "matchday" ? " matchday" : ""}`}>
        <SetupModal
            isOpen={showSetupModal}
            onClose={() => setShowSetupModal(false)}
            onSave={handleSaveSettings}
            initialSettings={setupInitialSettings}
        />
        <ExportModal
            isOpen={showExportModal}
            onClose={() => setShowExportModal(false)}
            onExport={handleExportWithName}
            defaultName={exportDefaultName}
        />
        {uiStyle === "matchday" && (
            <header className="matchday-bar">
                <div className="mb-brand">
                    <strong>Overlake 16965</strong>
                    <span>PathPlanner</span>
                </div>
                <div className="mb-status">
                    <span className={`mb-chip mb-alliance ${alliance}`}>{alliance === "blue" ? "Blue" : "Red"} alliance</span>
                    <span className={`mb-chip mb-conn ${isConnected ? "on" : "off"}`}>
                        {isConnected ? "Robot linked" : "No robot"}
                    </span>
                    <span className="mb-chip mb-path">{displayPoints.length} pts · {toFixed(totalLength, 0)} in</span>
                </div>
            </header>
        )}
        <div className="app-shell" ref={layoutRef} style={shellStyle}>
            <BuildPanel
                shapeType={shapeType}
                setShapeType={selectShape}
                drawMode={drawMode}
                setDrawMode={setDrawMode}
                headingMode={headingMode}
                setHeadingMode={setHeadingMode}
                endHeading={endHeading}
                setEndHeading={setEndHeading}
                snapInches={snapInches}
                setSnapInches={setSnapInches}
                startPose={startPose}
                setStartPose={setStartPose}
                placeStart={placeStart}
                togglePlaceStart={togglePlaceStart}
                useLivePose={useLivePoseAsStart}
                livePoseAvailable={Boolean(livePose)}
                tagName={tagName}
                setTagName={setTagName}
                tagValue={tagValue}
                setTagValue={setTagValue}
                tagValueSource={tagValueSource}
                setTagValueSource={setTagValueSource}
                tagGlobalName={tagGlobalName}
                setTagGlobalName={setTagGlobalName}
                tagPointIndex={tagPointIndex}
                setTagPointIndex={setTagPointIndex}
                addTag={addTag}
                pointsLength={displayPoints.length}
                editMode={editMode}
                toggleEditMode={toggleEditMode}
                selectedPointIndices={selectedPointIndices}
                setSelectedPointIndices={setSelectedPointIndices}
                updatePoint={updatePoint}
                deletePoint={deletePoint}
                deletePoints={deletePoints}
                points={displayPoints}
                tags={tags}
                onRemoveTag={removeTag}
                onEditTag={editTag}
                globalVars={globalVars}
                onAddGlobalVar={addGlobalVar}
                onUpdateGlobalVar={updateGlobalVar}
                onRemoveGlobalVar={removeGlobalVar}
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
                    pathPoints={pathPoints}
                    displayPoints={displayPoints}
                    segments={segments}
                    onAddLineSegment={appendLineSegment}
                    onAddBezierSegment={appendBezierSegment}
                    onAddArcSegment={appendArcSegment}
                    onAddSamples={appendSegmentsFromSamples}
                    placeStart={placeStart}
                    setPlaceStart={setPlaceStart}
                    shapeType={shapeType}
                    drawMode={drawMode}
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
                onUpdateSegmentControl={updateSegmentControl}
                onUpdateSegmentMid={updateSegmentMid}
                onBeginEditAction={beginEditAction}
                onEndEditAction={endEditAction}
                highlightSelection={expandedPointIndex !== null}
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
                pointsCount={displayPoints.length}
                totalLength={totalLength}
                previewLimits={previewLimits}
                playDist={playDist}
                code={code}
                onUndo={undoLast}
                onRedo={redoLast}
                canUndo={undoStack.length > 0 || Boolean(bezierTemp) || Boolean(arcTemp)}
                canRedo={redoStack.length > 0}
                onClear={clearAll}
                lastUpload={lastUpload}
                onDismissUpload={() => setLastUpload(null)}
                pathDirty={Boolean(lastUpload?.state === "ok" && lastUpload.revision !== pathRevision)}
                importError={importError}
                onDismissImportError={() => setImportError(null)}
                tags={tags}
                onRemoveTag={removeTag}
                onEditTag={editTag}
                onReorderTags={reorderTags}
                onAddTag={addTagFromRunPanel}
                onReorderPoints={reorderPoints}
                onTogglePointExpand={togglePointExpansion}
                expandedPointIndex={expandedPointIndex}
                onUpdatePoint={updatePoint}
                startPose={startPose}
                onUpdateStartPose={updateStartPose}
                onUpdateSegmentControl={updateSegmentControl}
                onUpdateSegmentMid={updateSegmentMid}
                onUpdateSegmentHeadingMode={updateSegmentHeadingMode}
                estTimeSec={estRunTimeSeconds}
                estTimeBreakdown={estTimeBreakdown}
                onExportPath={onExportPath}
                onImportFile={onImportPath}
                points={displayPoints}
                segments={segments}
                onSwitchSides={switchSides}
                alliance={alliance}
                onAllianceChange={setAlliance}
                globalVars={globalVars}
                isConnected={isConnected}
                robotStatus={robotStatus}
                robotConfig={robotConfig}
                waitForOpMode={waitForOpMode}
                onInstantUploadInit={doInstantUploadInit}
                onInit={sendInit}
                onStart={sendStart}
                onStopOpMode={sendStop}
            />
        </div>
        </div>
        </div>
    );
}
