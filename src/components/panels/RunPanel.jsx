import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { DEFAULT_OP_MODE, HUB_IP, TAG_TEMPLATES } from "../../constants/config";

const runLabel = (status) =>
    status === "sending" ? "Queuing..." : status === "ok" ? "Queued" : status === "fail" ? "Failed Run" : "Run";

const runClass = (status) =>
    status === "ok"
        ? "btn run-ok"
        : status === "fail"
            ? "btn run-fail"
            : status === "sending"
                ? "btn run-sending"
                : "btn run";

const OP_MODE_STOP_SENTINEL = "$Stop$Robot$";

const displayOpMode = (name) => (!name || name === OP_MODE_STOP_SENTINEL ? "None (stopped)" : name);

const formatClock = (timestamp) =>
    new Date(timestamp).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});

export default function RunPanel({
                                     onUpload,
                                     onRun,
                                     uploadStatus,
                                     runStatus,
                                     onCopy,
                                     copied,
                                     playState,
                                     onTogglePlay,
                                     onStop,
                                     pointsCount,
                                     totalLength,
                                     previewLimits,
                                     playDist,
                                     code,
                                     onUndo,
                                     onRedo,
                                     canUndo,
                                     canRedo,
                                     onClear,
                                     lastUpload,
                                     onDismissUpload,
                                     pathDirty,
                                     importError,
                                     onDismissImportError,
                                     tags,
                                     onRemoveTag,
                                     onEditTag,
                                     onReorderTags,
                                     onAddTag,
                                     onReorderPoints,
                                     onTogglePointExpand,
                                     expandedPointIndex,
                                     onUpdatePoint,
                                     startPose,
                                     onUpdateStartPose,
                                     // NEW:
                                     estTimeSec,
                                     estTimeBreakdown,
                                     onExportPath,
                                     onImportFile,
                                     points,
                                     segments,
                                     alliance,
                                     onAllianceChange,
                                     onSwitchSides,
                                     globalVars = [],
                                     // WebSocket & Robot Status
                                     isConnected,
                                     robotStatus,
                                     robotConfig,
                                     waitForOpMode,
                                     onInstantUploadInit,
                                     onInit,
                                     onStart,
                                     onStopOpMode,
                                     onUpdateSegmentControl,
                                     onUpdateSegmentMid,
                                     onUpdateSegmentHeadingMode,
                                 }) {
    const lengthDisplay = toFixed(totalLength, 1);
    const timeDisplay = Number.isFinite(estTimeSec) ? toFixed(estTimeSec, 1) : "0.0";
    const stops = estTimeBreakdown?.stops ?? [];
    const stopCount = stops.reduce((sum, stop) => sum + stop.items.length, 0);
    const stopsTitle = stops
        .map((stop) => {
            const where = stop.point === 0 ? "Start" : `Point ${stop.point}`;
            const parts = stop.items.map((item) => `${item.name} ${toFixed(item.seconds, 2)} s`).join(" + ");
            return `${where}: ${parts}`;
        })
        .join("\n");
    const progress = totalLength > 0 ? Math.round((playDist / totalLength) * 100) : 0;

    const fileInputRef = useRef(null);
    const [initialized, setInitialized] = useState(false);
    const [hasSentInit, setHasSentInit] = useState(false);
    const [debugMsg, setDebugMsg] = useState("");
    const [editingIndex, setEditingIndex] = useState(null);
    const [editName, setEditName] = useState("");
    const [editValue, setEditValue] = useState(0);
    const [editValueSource, setEditValueSource] = useState("manual");
    const [editGlobalName, setEditGlobalName] = useState("");
    const [editPointIndex, setEditPointIndex] = useState(0);
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const [draggedPointIndex, setDraggedPointIndex] = useState(null);
    const draggedTagIndexRef = useRef(null);
    const draggedTagPointIndexRef = useRef(null);
    // Selected op mode must be chosen before initializing the robot
    const [selectedOpMode, setSelectedOpMode] = useState("");
    const [opModeWarning, setOpModeWarning] = useState(null);
    const [starting, setStarting] = useState(false);
    const opModeWarningTimerRef = useRef(null);

    const [isAddingTag, setIsAddingTag] = useState(false);
    const [addTagPointIndex, setAddTagPointIndex] = useState(null);
    const [newTagName, setNewTagName] = useState("");
    const [newTagValue, setNewTagValue] = useState("");
    const [newTagValueSource, setNewTagValueSource] = useState("manual");
    const [newTagGlobalName, setNewTagGlobalName] = useState("");
    const [newTagPointIndex, setNewTagPointIndex] = useState("");

    const [closingPointIndex, setClosingPointIndex] = useState(null);
    const closingTimerRef = useRef(null);
    const prevExpandedRef = useRef(expandedPointIndex);
    const pointDragGhostRef = useRef(null);

    useLayoutEffect(() => {
        const prev = prevExpandedRef.current;
        if (prev !== null && prev !== expandedPointIndex) {
            if (closingTimerRef.current) {
                clearTimeout(closingTimerRef.current);
            }
            setClosingPointIndex(prev);
            closingTimerRef.current = setTimeout(() => {
                setClosingPointIndex(null);
                closingTimerRef.current = null;
            }, 200);
        }
        prevExpandedRef.current = expandedPointIndex;
    }, [expandedPointIndex]);

    useEffect(() => () => {
        if (closingTimerRef.current) {
            clearTimeout(closingTimerRef.current);
        }
    }, []);

    useEffect(() => () => {
        if (opModeWarningTimerRef.current) {
            clearTimeout(opModeWarningTimerRef.current);
            opModeWarningTimerRef.current = null;
        }
    }, []);

    const handlePointDragStart = (event, pointIndex) => {
        setDraggedPointIndex(pointIndex);
        if (!event.dataTransfer) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(pointIndex));

        const source = event.currentTarget;
        if (!(source instanceof HTMLElement)) return;
        const rect = source.getBoundingClientRect();
        const ghost = source.cloneNode(true);
        ghost.classList.add("drag-ghost");
        ghost.style.width = `${rect.width}px`;
        ghost.style.maxWidth = `${rect.width}px`;
        ghost.style.position = "fixed";
        ghost.style.top = "-1000px";
        ghost.style.left = "-1000px";
        ghost.style.pointerEvents = "none";
        ghost.style.opacity = "0.9";
        ghost.style.zIndex = "9999";
        document.body.appendChild(ghost);
        pointDragGhostRef.current = ghost;
        event.dataTransfer.setDragImage(ghost, 20, 20);
    };

    const handlePointDragEnd = () => {
        setDraggedPointIndex(null);
        if (pointDragGhostRef.current) {
            pointDragGhostRef.current.remove();
            pointDragGhostRef.current = null;
        }
    };

    const clearTagDragState = () => {
        draggedTagIndexRef.current = null;
        draggedTagPointIndexRef.current = null;
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const handleTagDragStart = (event, tagIndex, pointIndex) => {
        event.stopPropagation();
        if (!event.dataTransfer) return;
        draggedTagIndexRef.current = tagIndex;
        draggedTagPointIndexRef.current = pointIndex;
        setDraggedIndex(tagIndex);
        setDragOverIndex(null);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(tagIndex));
    };

    const handleTagDragOver = (event, tagIndex, pointIndex) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        const fromIndex = draggedTagIndexRef.current;
        if (fromIndex === null || draggedTagPointIndexRef.current !== pointIndex) return;
        if (fromIndex === tagIndex) return;
        if (dragOverIndex !== tagIndex) setDragOverIndex(tagIndex);
        if (!onReorderTags) return;

        const rect = event.currentTarget.getBoundingClientRect();
        const before = event.clientY < rect.top + rect.height / 2;
        const insertIndex = before
            ? (fromIndex < tagIndex ? tagIndex - 1 : tagIndex)
            : (fromIndex < tagIndex ? tagIndex : tagIndex + 1);

        if (insertIndex === fromIndex) return;
        onReorderTags(fromIndex, insertIndex);
        draggedTagIndexRef.current = insertIndex;
        setDraggedIndex(insertIndex);
    };
    // Group tags by point index
    const tagsByPoint = tags.reduce((acc, tag, index) => {
        const rawIndex = Number(tag.index) || 0;
        const pointIndex = rawIndex === 0 ? -1 : rawIndex - 1; // -1 is start
        if (!acc[pointIndex]) {
            acc[pointIndex] = [];
        }
        acc[pointIndex].push({...tag, originalIndex: index});
        return acc;
    }, {});

    const resolveTagValue = (tag) => {
        if (tag?.globalName) {
            const match = globalVars?.find((entry) => entry.name === tag.globalName);
            const resolved = Number(match?.value);
            if (Number.isFinite(resolved)) return resolved;
        }
        return Number(tag?.value) || 0;
    };

    // "velocity" tags are a percent of the robot's max speed (0-100).
    const isPercentTag = (name) => String(name || "").trim() === "velocity";
    const clampTagValue = (name, value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 0;
        return isPercentTag(name) ? Math.max(0, Math.min(100, numeric)) : numeric;
    };
    const tagValueBounds = (name) => (isPercentTag(name) ? {min: 0, max: 100, step: 1} : {step: 0.1});

    const clampTagIndex = (value, fallback) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        if (parsed <= 0) return 0;
        return Math.max(1, Math.min(pointsCount, parsed));
    };

    useEffect(() => {
        if (addTagPointIndex === null) return;
        if (expandedPointIndex !== addTagPointIndex) {
            setIsAddingTag(false);
            setAddTagPointIndex(null);
            setNewTagName("");
            setNewTagValue("");
            setNewTagPointIndex("");
            setNewTagValueSource("manual");
            setNewTagGlobalName("");
        }
    }, [expandedPointIndex, addTagPointIndex]);


    // Keep a ref to the latest robotStatus for async waiting checks
    const robotStatusRef = useRef(robotStatus);
    useEffect(() => { robotStatusRef.current = robotStatus; }, [robotStatus]);

    const fallbackWaitForOpMode = (opMode, timeoutMs = 6000) => new Promise((resolve, reject) => {
        const target = String(opMode || "").toLowerCase();
        const deadline = Date.now() + timeoutMs;
        const check = () => {
            const cur = robotStatusRef.current;
            const current = String(cur?.opMode || "").toLowerCase();
            if (target && current.includes(target)) return resolve(true);
            if (Date.now() > deadline) return reject(new Error('timeout'));
            setTimeout(check, 200);
        };
        check();
    });

    const clearOpModeWarning = () => {
        if (opModeWarningTimerRef.current) {
            clearTimeout(opModeWarningTimerRef.current);
            opModeWarningTimerRef.current = null;
        }
        setOpModeWarning(null);
    };

    const showOpModeWarning = (message) => {
        setOpModeWarning(message);
        if (opModeWarningTimerRef.current) {
            clearTimeout(opModeWarningTimerRef.current);
        }
        opModeWarningTimerRef.current = setTimeout(() => {
            setOpModeWarning(null);
            opModeWarningTimerRef.current = null;
        }, 4500);
    };

    useEffect(() => {
        // Sync local initialized state with robotStatus prop
        if (!robotStatus) {
            setInitialized(false);
            setHasSentInit(false);
            return;
        }
        const active = robotStatus.activeOpMode || robotStatus.opMode || robotStatus.activeOpModeName || robotStatus.opModeName;
        const stateStr = robotStatus.activeOpModeStatus || robotStatus.status || robotStatus.state || robotStatus.activeOpModeStatus;
        const isPathActive = typeof active === 'string' && active.toLowerCase().includes('path');
        
        // Only consider "initialized" (showing Start button) if we are in INIT or QUEUED state.
        // If we are RUNNING, we want the button to show "Init" (to allow restart).
        const isInInitPhase = typeof stateStr === 'string' && (stateStr.toLowerCase().includes('init') || stateStr.toLowerCase().includes('queued'));
        
        const newInitialized = Boolean(isPathActive && isInInitPhase);
        setInitialized(newInitialized);
        // Reset hasSentInit if robot is no longer initialized
        if (!newInitialized) {
            setHasSentInit(false);
        }
    }, [robotStatus]);

    // Start on DEFAULT_OP_MODE; once the robot reports its OpModes, fall back to
    // another path OpMode (or the first one) if the selection isn't on this robot.
    useEffect(() => {
        const list = robotConfig?.opModeList;
        if (!selectedOpMode) {
            setSelectedOpMode(DEFAULT_OP_MODE);
        } else if (list?.length > 0 && !list.includes(selectedOpMode)) {
            setSelectedOpMode(list.includes(DEFAULT_OP_MODE)
                ? DEFAULT_OP_MODE
                : list.find((m) => /path/i.test(m)) ?? list[0]);
        }
    }, [robotConfig?.opModeList, selectedOpMode]);

    useEffect(() => {
        clearOpModeWarning();
    }, [selectedOpMode]);

    const handleUploadClick = async () => {
        if (!isConnected) return;
        if (!selectedOpMode) {
            setDebugMsg('Select an OpMode before uploading.');
            return;
        }

        clearOpModeWarning();
        const waitFn = typeof waitForOpMode === 'function' ? waitForOpMode : fallbackWaitForOpMode;
        const performUpload = async () => {
            if (onUpload) await onUpload(selectedOpMode);
        };

        try {
            const currentOpMode = String(robotStatusRef.current?.opMode || '');
            const currentStatus = robotStatusRef.current?.status || '';
            if (currentOpMode.toLowerCase().includes(String(selectedOpMode).toLowerCase()) && currentStatus !== 'STOPPED') {
                setDebugMsg(`Uploading to ${selectedOpMode}…`);
                await performUpload();
                setHasSentInit(true);
                setDebugMsg("");
                return;
            }

            setDebugMsg(`Initializing ${selectedOpMode}…`);
            setHasSentInit(true);

            // Prefer the App-level instant init+upload orchestration if available
            if (typeof onInstantUploadInit === 'function') {
                await onInstantUploadInit(selectedOpMode);
                setDebugMsg("");
                return;
            }

            // Fallback: call send-init then wait then upload
            if (onInit) await onInit(selectedOpMode);

            await waitFn(selectedOpMode);

            setDebugMsg(`Uploading to ${selectedOpMode}…`);
            await new Promise((resolve) => setTimeout(resolve, 500));

            await performUpload();
            setDebugMsg("");
        } catch (e) {
            console.error(e);
            setHasSentInit(false);
            setDebugMsg("");
            if (e?.code === 'PATH_SERVER_UNAVAILABLE') {
                const incompatibleName = e?.opModeName || selectedOpMode;
                showOpModeWarning(`${incompatibleName} is not running the Path Server. Please select a compatible OpMode.`);
            }
        }
    };

    // Start always re-sends the path first, so edits made after Init are never left behind.
    // If the upload fails the OpMode is not started.
    const handleStartClick = async () => {
        clearOpModeWarning();
        setStarting(true);
        try {
            setDebugMsg("Uploading latest path…");
            if (onUpload) await onUpload(selectedOpMode);
            setDebugMsg("Starting…");
            if (onStart) await onStart();
        } catch (e) {
            console.error(e);
            if (e?.code === 'PATH_SERVER_UNAVAILABLE') {
                showOpModeWarning(`${e?.opModeName || selectedOpMode} is not running the Path Server. Please select a compatible OpMode.`);
            }
        } finally {
            setStarting(false);
            setTimeout(() => setDebugMsg(""), 1500);
        }
    };

    const isReady = initialized || hasSentInit;
    const isBusy = uploadStatus === "sending" || starting;
    const robotState = String(robotStatus?.status || "").toUpperCase();
    const opModeOptions = robotConfig?.opModeList?.length > 0 ? robotConfig.opModeList : [selectedOpMode].filter(Boolean);
    const activeOpMode = displayOpMode(robotStatus?.opMode);
    const primaryLabel = starting
        ? "Starting…"
        : uploadStatus === "sending"
            ? "Uploading…"
            : isReady ? "▶ Start" : "Init & upload";

    return (
        <aside className="panel panel-run">
            <div className="panel-header">
                <h2>Run & Export</h2>
            </div>
            <div className="panel-body scroll-area">
                <section className="control-card">
                    <div className="card-header">
                        <h3>Robot Control</h3>
                        <p>Init uploads the path; Start re-sends it and runs.</p>
                    </div>

                    <div className="robot-conn" role="status">
                        <span className={`conn-dot${isConnected ? " on" : ""}`} aria-hidden="true" />
                        <span className="conn-label">{isConnected ? "Connected" : "Not connected"}</span>
                        {isConnected && robotStatus?.battery != null && (
                            <span className="conn-meta">{robotStatus.battery} V</span>
                        )}
                        {isConnected && robotState && (
                            <span className={`state-chip state-${robotState.split(/[^A-Z]/)[0].toLowerCase()}`}>
                                {robotState}
                            </span>
                        )}
                    </div>

                    {isConnected ? (
                        <>
                            <div className="field">
                                <label htmlFor="run-opmode">OpMode</label>
                                <select
                                    id="run-opmode"
                                    value={selectedOpMode}
                                    onChange={(e) => setSelectedOpMode(e.target.value)}
                                    disabled={isBusy}
                                >
                                    {opModeOptions.map((m) => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                                {robotStatus?.opMode && robotStatus.opMode !== OP_MODE_STOP_SENTINEL && activeOpMode !== selectedOpMode && (
                                    <span className="field-hint">Robot is on {activeOpMode}</span>
                                )}
                            </div>

                            <div className="run-actions">
                                <button
                                    className={`btn btn-lg ${isReady ? "ok" : "primary"}`}
                                    onClick={isReady ? handleStartClick : handleUploadClick}
                                    disabled={isBusy || pointsCount === 0}
                                    title={pointsCount === 0 ? "Place at least one point on the field first" : undefined}
                                >
                                    {primaryLabel}
                                </button>
                                <button className="btn btn-lg danger" onClick={onStopOpMode}>
                                    Stop
                                </button>
                            </div>
                        </>
                    ) : (
                        <p className="helper-text">Join the robot&apos;s Wi-Fi to upload and run paths.</p>
                    )}

                    {debugMsg && <p className="helper-text">{debugMsg}</p>}

                    {opModeWarning && (
                        <div className="status-line fail" role="alert">
                            <span>{opModeWarning}</span>
                        </div>
                    )}
                    {lastUpload?.state === "ok" && (
                        <div className="status-line ok" role="status">
                            <span>
                                ✓ {lastUpload.points} pts · {toFixed(lastUpload.length, 0)} in → {lastUpload.opMode} at {formatClock(lastUpload.at)}
                                {pathDirty && <em className="status-stale"> — edited since, Start re-uploads it</em>}
                            </span>
                            <button className="status-dismiss" onClick={onDismissUpload} aria-label="Dismiss upload status">×</button>
                        </div>
                    )}
                    {lastUpload?.state === "fail" && (
                        <div className="status-line fail" role="alert">
                            <span>Upload failed: {lastUpload.reason}</span>
                            <button className="status-dismiss" onClick={onDismissUpload} aria-label="Dismiss upload error">×</button>
                        </div>
                    )}
                </section>

                <section className="control-card">
                    <div className="card-header">
                        <h3>Playback</h3>
                        <p>Preview the route before committing to the field.</p>
                    </div>
                    <div className="card-actions stack">
                        <button className={`btn ghost ${playState === "playing" ? "pill-active" : ""}`} onClick={onTogglePlay}>
                            {playState === "playing" ? "Pause preview" : "Play preview"}
                        </button>
                        <button className="btn ghost" onClick={onStop}>
                            Reset preview
                        </button>
                    </div>
                    <div className="stat-grid">
                        <Stat label="Points" value={pointsCount} />
                        <Stat label="Length (in)" value={lengthDisplay} />
                        <Stat label="Est. time (s)" value={timeDisplay} />
                    </div>
                    {estTimeBreakdown && (
                        <p className="helper-text playback-note" title={stopsTitle || "No stops on this path"}>
                            {toFixed(estTimeBreakdown.driving, 1)} s driving + {toFixed(estTimeBreakdown.stopped, 1)} s stopped
                            {stopCount > 0 ? ` (${stopCount} stop${stopCount === 1 ? "" : "s"})` : ""}
                        </p>
                    )}
                    {previewLimits && (
                        <p
                            className="helper-text playback-note"
                            title={`accel ${toFixed(previewLimits.accel, 1)} in/s^2${previewLimits.source === "robot" && !previewLimits.accelFromRobot ? " (Setup fallback)" : ""}, decel ${toFixed(previewLimits.decel, 1)} in/s^2, strafe ${toFixed(previewLimits.maxStrafe, 1)} in/s`}
                        >
                            {previewLimits.source === "robot"
                                ? `Using robot limits: ${toFixed(previewLimits.maxSpeed, 1)} in/s${previewLimits.accelFromRobot ? "" : `, accel ${toFixed(previewLimits.accel, 0)} in/s² from Setup`}`
                                : isConnected
                                    ? `Using preview fallback: ${toFixed(previewLimits.maxSpeed, 1)} in/s (robot sent no limits. Not tuned yet? Open AutoTune at http://${HUB_IP}:10158)`
                                    : `Using preview fallback: ${toFixed(previewLimits.maxSpeed, 1)} in/s (connect to the robot for its real limits)`}
                        </p>
                    )}
                    <div className="progress-line">
                        <span className="small">Progress</span>
                        <span className="small">
              {progress}% of {toFixed(playDist, 1)} / {lengthDisplay} in
            </span>
                    </div>
                </section>

                <section className="control-card">
                    <div className="card-header">
                        <h3>Points and Tags</h3>
                        <p>Organize actions by path point</p>
                    </div>
                    <>
                        {points.length === 0 && (
                            <p className="helper-text">Add points to the path to create tags</p>
                        )}
                        <div
                            className="point-section"
                        >
                            <div
                                className="point-header"
                                role="button"
                                tabIndex={0}
                                aria-expanded={expandedPointIndex === -1}
                                onClick={() => onTogglePointExpand?.(-1)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        onTogglePointExpand?.(-1);
                                    }
                                }}
                            >
                                <div>
                                    <h4>Start Point</h4>
                                    <p>({formatNumber(startPose?.x, 1) || "0"}, {formatNumber(startPose?.y, 1) || "0"}){startPose?.h !== undefined ? ` (heading ${formatNumber(startPose.h, 1)} deg)` : ""}</p>
                                    {(tagsByPoint[-1] || []).length > 0 && (
                                        <p className="tag-count">{(tagsByPoint[-1] || []).length} tag{(tagsByPoint[-1] || []).length !== 1 ? 's' : ''}</p>
                                    )}
                                </div>
                                <span className="collapse-caret">{expandedPointIndex === -1 ? "\u25BE" : "\u25B8"}</span>
                            </div>

                            {((expandedPointIndex === -1) || (closingPointIndex === -1)) && (
                                <div
                                    className={`point-tags-shell${expandedPointIndex === -1 ? " open" : ""}${closingPointIndex === -1 ? " closing" : ""}`}
                                >
                                    <div className="point-tags-content">
                                        <div className="field-grid point-coordinates">
                                            <div className="field">
                                                <label>X (in)</label>
                                                <NumberField
                                                    value={startPose?.x ?? 0}
                                                    step="0.1"
                                                    onCommit={(value) => onUpdateStartPose?.({ x: value })}
                                                />
                                            </div>
                                            <div className="field">
                                                <label>Y (in)</label>
                                                <NumberField
                                                    value={startPose?.y ?? 0}
                                                    step="0.1"
                                                    onCommit={(value) => onUpdateStartPose?.({ y: value })}
                                                />
                                            </div>
                                            <div className="field">
                                                <label>Heading (deg)</label>
                                                <NumberField
                                                    value={startPose?.h ?? 0}
                                                    step="1"
                                                    onCommit={(value) => onUpdateStartPose?.({ h: value })}
                                                />
                                            </div>
                                        </div>
                                        {(tagsByPoint[-1] || []).length > 0 ? (
                                            <div className="point-tag-list">
                                                {(tagsByPoint[-1] || []).map((tag) => {
                                                    const isEditing = editingIndex === tag.originalIndex;

                                                    return (
                                                        <div
                                                            key={tag.originalIndex}
                                                            className={`point-tag-item ${draggedIndex === tag.originalIndex ? 'dragging' : ''} ${dragOverIndex === tag.originalIndex ? 'drag-over' : ''}`}
                                                            draggable={!isEditing}
                                                            onDragStart={(e) => {
                                                                if (!isEditing) handleTagDragStart(e, tag.originalIndex, -1);
                                                            }}
                                                            onDragEnter={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                            }}
                                                            onDragLeave={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) {
                                                                    setDragOverIndex(null);
                                                                }
                                                            }}
                                                            onDragOver={(e) => handleTagDragOver(e, tag.originalIndex, -1)}
                                                            onDrop={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                clearTagDragState();
                                                            }}
                                                            onDragEnd={(e) => {
                                                                e.stopPropagation();
                                                                clearTagDragState();
                                                            }}
                                                        >
                                                            {isEditing ? (
                                                                <>
                                                                    <div className="field-grid tag-add-fields">
                                                                        <div className="field">
                                                                            <label>Tag Type</label>
                                                                            <select
                                                                                value={editName}
                                                                                onChange={(e) => setEditName(e.target.value)}
                                                                            >
                                                                                <option value="">-- Select Tag Type --</option>
                                                                                {TAG_TEMPLATES.map((template) => (
                                                                                    <option key={template.name} value={template.name}>
                                                                                        {template.name}{template.unit ? ` - ${template.unit}` : ""}
                                                                                    </option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                        <div className="field">
                                                                            <label>Value source</label>
                                                                            <select
                                                                                value={editValueSource}
                                                                                onChange={(e) => {
                                                                                    const source = e.target.value;
                                                                                    setEditValueSource(source);
                                                                                    if (source !== "global") setEditGlobalName("");
                                                                                }}
                                                                            >
                                                                                <option value="manual">Manual</option>
                                                                                <option value="global" disabled={!globalVars?.length}>Global variable</option>
                                                                            </select>
                                                                        </div>
                                                                        <div className="field">
                                                                            <label>{editValueSource === "global" ? "Global variable" : "Value"}</label>
                                                                            {editValueSource === "global" ? (
                                                                                <select
                                                                                    value={editGlobalName}
                                                                                    onChange={(e) => setEditGlobalName(e.target.value)}
                                                                                >
                                                                                    <option value="">-- Select global --</option>
                                                                                    {globalVars?.map((entry) => (
                                                                                        <option key={entry.name} value={entry.name}>
                                                                                            {entry.name}
                                                                                        </option>
                                                                                    ))}
                                                                                </select>
                                                                            ) : (
                                                                                <input
                                                                                    type="number"
                                                                                    {...tagValueBounds(editName)}
                                                                                    value={editValue}
                                                                                    onChange={(e) => setEditValue(clampTagValue(editName, e.target.value))}
                                                                                />
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="point-tag-actions">
                                                                        <button
                                                                            className="btn primary"
                                                                            onClick={() => {
                                                                                if (editName.trim() && onEditTag) {
                                                                                    const globalName = editValueSource === "global" ? editGlobalName : undefined;
                                                                                    if (editValueSource !== "global" || globalName) {
                                                                                        onEditTag(tag.originalIndex, editName.trim(), clampTagValue(editName, editValue), editPointIndex, globalName);
                                                                                    }
                                                                                }
                                                                                setEditingIndex(null);
                                                                            }}
                                                                            disabled={editValueSource === "global" && !editGlobalName}
                                                                        >
                                                                            Save
                                                                        </button>
                                                                        <button
                                                                            className="btn ghost"
                                                                            onClick={() => setEditingIndex(null)}
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <div className="point-tag-header">
                                                                        <span className="drag-handle" title="Drag to reorder">::</span>
                                                                        <div style={{flex: 1, minWidth: 0}}>
                                                                            <span className="point-tag-name">{tag.name}</span>
                                                                            <div className="point-tag-value">
                                                                                {(() => {
                                                                                    const template = TAG_TEMPLATES.find((entry) => entry.name === tag.name);
                                                                                    const unit = template?.unit ? ` ${template.unit}` : "";
                                                                                    const valueLabel = tag.globalName ? `${tag.globalName}: ${resolveTagValue(tag)}` : resolveTagValue(tag);
                                                                                    return `${valueLabel}${unit}`;
                                                                                })()}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="point-tag-actions">
                                                                        <button
                                                                            className="btn ghost"
                                                                            onClick={() => {
                                                                                setEditingIndex(tag.originalIndex);
                                                                                setEditName(tag.name);
                                                                                setEditValue(tag.value);
                                                                                setEditValueSource(tag.globalName ? "global" : "manual");
                                                                                setEditGlobalName(tag.globalName || "");
                                                                                setEditPointIndex(tag.index);
                                                                            }}
                                                                        >
                                                                            Edit
                                                                        </button>
                                                                        {onRemoveTag && (
                                                                            <button 
                                                                                className="btn danger" 
                                                                                onClick={() => onRemoveTag(tag.originalIndex)}
                                                                            >
                                                                                Delete
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="helper-text">No tags for this point</p>
                                        )}

                                        {!isAddingTag && (
                                            <button
                                                className="btn primary"
                                                onClick={() => {
                                                    setNewTagName("");
                                                    setNewTagValue("");
                                                    setNewTagPointIndex("0");
                                                    setNewTagValueSource("manual");
                                                    setNewTagGlobalName("");
                                                    setIsAddingTag(true);
                                                    setAddTagPointIndex(-1);
                                                }}
                                                style={{width: '100%'}}
                                            >
                                                + Add Tag to Start Point
                                            </button>
                                        )}

                                        {isAddingTag && addTagPointIndex === -1 && (
                                            <div className="point-tag-item" style={{background: 'rgba(92, 210, 255, 0.08)', borderColor: 'rgba(92, 210, 255, 0.2)'}}>
                                                <div className="field-grid tag-add-fields">
                                                    <div className="field">
                                                        <label>Tag Type</label>
                                                        <select
                                                            value={newTagName}
                                                            onChange={(e) => {
                                                                const selectedName = e.target.value;
                                                                setNewTagName(selectedName);
                                                                // Set default values based on tag type
                                                                const template = TAG_TEMPLATES.find((entry) => entry.name === selectedName);
                                                                if (template && template.defaultValue !== undefined) {
                                                                    setNewTagValue(template.defaultValue);
                                                                } else {
                                                                    setNewTagValue("");
                                                                }
                                                            }}
                                                            autoFocus
                                                        >
                                                            <option value="">-- Select Tag Type --</option>
                                                            {TAG_TEMPLATES.map((template) => (
                                                                <option key={template.name} value={template.name}>
                                                                    {template.name}{template.unit ? ` - ${template.unit}` : ""}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="field">
                                                        <label>Value source</label>
                                                        <select
                                                            value={newTagValueSource}
                                                            onChange={(e) => {
                                                                const source = e.target.value;
                                                                setNewTagValueSource(source);
                                                                if (source !== "global") setNewTagGlobalName("");
                                                            }}
                                                        >
                                                            <option value="manual">Manual</option>
                                                            <option value="global" disabled={!globalVars?.length}>Global variable</option>
                                                        </select>
                                                    </div>
                                                    <div className="field">
                                                        <label>{newTagValueSource === "global" ? "Global variable" : "Value"}</label>
                                                        {newTagValueSource === "global" ? (
                                                            <select
                                                                value={newTagGlobalName}
                                                                onChange={(e) => setNewTagGlobalName(e.target.value)}
                                                            >
                                                                <option value="">-- Select global --</option>
                                                                {globalVars?.map((entry) => (
                                                                    <option key={entry.name} value={entry.name}>
                                                                        {entry.name}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <input
                                                                type="number"
                                                                {...tagValueBounds(newTagName)}
                                                                value={newTagValue}
                                                                onChange={(e) => {
                                                                    const raw = e.target.value;
                                                                    setNewTagValue(raw === "" || raw === "-" ? raw : String(clampTagValue(newTagName, raw)));
                                                                }}
                                                                placeholder="0"
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="point-tag-actions">
                                                    <button
                                                        className="btn primary"
                                                        onClick={() => {
                                                            if (newTagName.trim() && onAddTag) {
                                                                const value = clampTagValue(newTagName, newTagValue);
                                                                const index = clampTagIndex(newTagPointIndex, 0);
                                                                const globalName = newTagValueSource === "global" ? newTagGlobalName : undefined;
                                                                if (newTagValueSource !== "global" || globalName) {
                                                                    onAddTag(newTagName.trim(), value, index, globalName);
                                                                }
                                                                setNewTagName("");
                                                                setNewTagValue("");
                                                                setNewTagPointIndex("");
                                                                setNewTagValueSource("manual");
                                                                setNewTagGlobalName("");
                                                                setIsAddingTag(false);
                                                                setAddTagPointIndex(null);
                                                            }
                                                        }}
                                                        disabled={!newTagName.trim() || (newTagValueSource === "global" && !newTagGlobalName)}
                                                    >
                                                        Add Tag
                                                    </button>
                                                    <button
                                                        className="btn ghost"
                                                        onClick={() => {
                                                            setNewTagName("");
                                                            setNewTagValue("");
                                                            setNewTagPointIndex("");
                                                            setNewTagValueSource("manual");
                                                            setNewTagGlobalName("");
                                                            setIsAddingTag(false);
                                                            setAddTagPointIndex(null);
                                                        }}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {points.map((point, pointIndex) => {
                                const pointTags = tagsByPoint[pointIndex] || [];
                                const segment = segments?.[pointIndex];
                                const typeLabel = segment?.type === "bezier" ? "Bezier" : segment?.type === "arc" ? "Arc" : "Line";
                                const isExpanded = expandedPointIndex === pointIndex;
                                const isClosing = closingPointIndex === pointIndex;
                                const isCurvedSegment = segment?.type === "bezier" || segment?.type === "arc";
                                const headingMode = segment?.headingMode || "straight";
                                const showHeadingInput = !isCurvedSegment || headingMode === "straight";

                                return (
                                    <div
                                        key={pointIndex}
                                        className="point-section"
                                        draggable={pointsCount > 1}
                                        onDragStart={(event) => handlePointDragStart(event, pointIndex)}
                                        onDragOver={(event) => {
                                            if (draggedPointIndex === null) return;
                                            event.preventDefault();
                                        }}
                                        onDrop={() => {
                                            if (draggedPointIndex === null) return;
                                            if (onReorderPoints) onReorderPoints(draggedPointIndex, pointIndex);
                                            setDraggedPointIndex(null);
                                        }}
                                        onDragEnd={handlePointDragEnd}
                                    >
                                        <div
                                            className="point-header"
                                            role="button"
                                    tabIndex={0}
                                    aria-expanded={isExpanded}
                                        onClick={() => onTogglePointExpand?.(pointIndex)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                onTogglePointExpand?.(pointIndex);
                                            }
                                        }}
                                >
                                    <div>
                                        <h4>Point {pointIndex + 1}{typeLabel ? ` - ${typeLabel}` : ""}</h4>
                                        <p>({formatNumber(point.x, 1) || "0"}, {formatNumber(point.y, 1) || "0"}){point.h !== undefined ? ` (heading ${formatNumber(point.h, 1)} deg)` : ""}</p>
                                        {pointTags.length > 0 && (
                                            <p className="tag-count">{pointTags.length} tag{pointTags.length !== 1 ? 's' : ''}</p>
                                        )}
                                    </div>
                                            <span className="collapse-caret">{isExpanded ? "\u25BE" : "\u25B8"}</span>
                                        </div>

                                        {(isExpanded || isClosing) && (
                                            <div
                                                className={`point-tags-shell${isExpanded ? " open" : ""}${isClosing ? " closing" : ""}`}
                                            >
                                                <div className="point-tags-content">
                                                <div className="field-grid point-coordinates">
                                                    <div className="field">
                                                        <label>X (in)</label>
                                                        <NumberField
                                                            value={point.x ?? 0}
                                                            step="0.1"
                                                            onCommit={(value) => onUpdatePoint?.(pointIndex, { x: value })}
                                                        />
                                                    </div>
                                                    <div className="field">
                                                        <label>Y (in)</label>
                                                        <NumberField
                                                            value={point.y ?? 0}
                                                            step="0.1"
                                                            onCommit={(value) => onUpdatePoint?.(pointIndex, { y: value })}
                                                        />
                                                    </div>
                                                    {showHeadingInput && (
                                                        <div className="field">
                                                            <label>Heading (deg)</label>
                                                            <NumberField
                                                                value={point.h ?? 0}
                                                                step="1"
                                                                onCommit={(value) => onUpdatePoint?.(pointIndex, { h: value })}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                                {isCurvedSegment && (
                                                    <div className="field-grid">
                                                        <div className="field">
                                                            <label>Heading strategy</label>
                                                            <select
                                                                value={headingMode}
                                                                onChange={(e) => onUpdateSegmentHeadingMode?.(pointIndex, e.target.value)}
                                                            >
                                                                <option value="straight">Straight</option>
                                                                <option value="tangent">Tangent</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                )}
                                                {segment?.type === "bezier" && (
                                                    <div className="field-grid" style={{marginTop: "10px"}}>
                                                        <div className="field">
                                                            <label>Control X (in)</label>
                                                            <NumberField
                                                                value={segment.control?.x ?? 0}
                                                                step="0.1"
                                                                onCommit={(value) => onUpdateSegmentControl?.(pointIndex, { x: value })}
                                                            />
                                                        </div>
                                                        <div className="field">
                                                            <label>Control Y (in)</label>
                                                            <NumberField
                                                                value={segment.control?.y ?? 0}
                                                                step="0.1"
                                                                onCommit={(value) => onUpdateSegmentControl?.(pointIndex, { y: value })}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                                {segment?.type === "arc" && (
                                                    <div className="field-grid" style={{marginTop: "10px"}}>
                                                        <div className="field">
                                                            <label>Mid X (in)</label>
                                                            <NumberField
                                                                value={segment.mid?.x ?? 0}
                                                                step="0.1"
                                                                onCommit={(value) => onUpdateSegmentMid?.(pointIndex, { x: value })}
                                                            />
                                                        </div>
                                                        <div className="field">
                                                            <label>Mid Y (in)</label>
                                                            <NumberField
                                                                value={segment.mid?.y ?? 0}
                                                                step="0.1"
                                                                onCommit={(value) => onUpdateSegmentMid?.(pointIndex, { y: value })}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                                {pointTags.length > 0 ? (
                                                    <div className="point-tag-list">
                                                {pointTags.map((tag) => {
                                                    const isEditing = editingIndex === tag.originalIndex;

                                                    return (
                                                        <div
                                                            key={tag.originalIndex}
                                                            className={`point-tag-item ${draggedIndex === tag.originalIndex ? 'dragging' : ''} ${dragOverIndex === tag.originalIndex ? 'drag-over' : ''}`}
                                                            draggable={!isEditing}
                                                            onDragStart={(e) => {
                                                                if (!isEditing) handleTagDragStart(e, tag.originalIndex, pointIndex);
                                                            }}
                                                            onDragEnter={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                            }}
                                                            onDragLeave={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) {
                                                                    setDragOverIndex(null);
                                                                }
                                                            }}
                                                            onDragOver={(e) => handleTagDragOver(e, tag.originalIndex, pointIndex)}
                                                            onDrop={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                clearTagDragState();
                                                            }}
                                                            onDragEnd={(e) => {
                                                                e.stopPropagation();
                                                                clearTagDragState();
                                                            }}
                                                        >
                                                            {isEditing ? (
                                                                <>
                                                                    <div className="field-grid tag-add-fields">
                                                                        <div className="field">
                                                                            <label>Tag Type</label>
                                                                            <select
                                                                                value={editName}
                                                                                onChange={(e) => setEditName(e.target.value)}
                                                                            >
                                                                                <option value="">-- Select Tag Type --</option>
                                                                                {TAG_TEMPLATES.map((template) => (
                                                                                    <option key={template.name} value={template.name}>
                                                                                        {template.name}{template.unit ? ` - ${template.unit}` : ""}
                                                                                    </option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                        <div className="field">
                                                                            <label>Value source</label>
                                                                            <select
                                                                                value={editValueSource}
                                                                                onChange={(e) => {
                                                                                    const source = e.target.value;
                                                                                    setEditValueSource(source);
                                                                                    if (source !== "global") setEditGlobalName("");
                                                                                }}
                                                                            >
                                                                                <option value="manual">Manual</option>
                                                                                <option value="global" disabled={!globalVars?.length}>Global variable</option>
                                                                            </select>
                                                                        </div>
                                                                        <div className="field">
                                                                            <label>{editValueSource === "global" ? "Global variable" : "Value"}</label>
                                                                            {editValueSource === "global" ? (
                                                                                <select
                                                                                    value={editGlobalName}
                                                                                    onChange={(e) => setEditGlobalName(e.target.value)}
                                                                                >
                                                                                    <option value="">-- Select global --</option>
                                                                                    {globalVars?.map((entry) => (
                                                                                        <option key={entry.name} value={entry.name}>
                                                                                            {entry.name}
                                                                                        </option>
                                                                                    ))}
                                                                                </select>
                                                                            ) : (
                                                                                <input
                                                                                    type="number"
                                                                                    {...tagValueBounds(editName)}
                                                                                    value={editValue}
                                                                                    onChange={(e) => setEditValue(clampTagValue(editName, e.target.value))}
                                                                                />
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="point-tag-actions">
                                                                        <button
                                                                            className="btn primary"
                                                                            onClick={() => {
                                                                                if (editName.trim() && onEditTag) {
                                                                                    const globalName = editValueSource === "global" ? editGlobalName : undefined;
                                                                                    if (editValueSource !== "global" || globalName) {
                                                                                        onEditTag(tag.originalIndex, editName.trim(), clampTagValue(editName, editValue), editPointIndex, globalName);
                                                                                    }
                                                                                }
                                                                                setEditingIndex(null);
                                                                            }}
                                                                            disabled={editValueSource === "global" && !editGlobalName}
                                                                        >
                                                                            Save
                                                                        </button>
                                                                        <button
                                                                            className="btn ghost"
                                                                            onClick={() => setEditingIndex(null)}
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <div className="point-tag-header">
                                                                        <span className="drag-handle" title="Drag to reorder">::</span>
                                                                        <div style={{flex: 1, minWidth: 0}}>
                                                                            <span className="point-tag-name">{tag.name}</span>
                                                                            <div className="point-tag-value">
                                                                                {(() => {
                                                                                    const template = TAG_TEMPLATES.find((entry) => entry.name === tag.name);
                                                                                    const unit = template?.unit ? ` ${template.unit}` : "";
                                                                                    const valueLabel = tag.globalName ? `${tag.globalName}: ${resolveTagValue(tag)}` : resolveTagValue(tag);
                                                                                    return `${valueLabel}${unit}`;
                                                                                })()}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="point-tag-actions">
                                                                        <button
                                                                            className="btn ghost"
                                                                            onClick={() => {
                                                                                setEditingIndex(tag.originalIndex);
                                                                                setEditName(tag.name);
                                                                                setEditValue(tag.value);
                                                                                setEditValueSource(tag.globalName ? "global" : "manual");
                                                                                setEditGlobalName(tag.globalName || "");
                                                                                setEditPointIndex(tag.index);
                                                                            }}
                                                                        >
                                                                            Edit
                                                                        </button>
                                                                        {onRemoveTag && (
                                                                            <button 
                                                                                className="btn danger" 
                                                                                onClick={() => onRemoveTag(tag.originalIndex)}
                                                                            >
                                                                                Delete
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="helper-text">No tags for this point</p>
                                        )}

                                        {!isAddingTag && (
                                            <button
                                                className="btn primary"
                                                onClick={() => {
                                                    setNewTagName("");
                                                    setNewTagValue("");
                                                    setNewTagPointIndex(pointIndex + 1);
                                                    setNewTagValueSource("manual");
                                                    setNewTagGlobalName("");
                                                    setIsAddingTag(true);
                                                    setAddTagPointIndex(pointIndex);
                                                }}
                                                disabled={pointsCount === 0}
                                                style={{width: '100%'}}
                                            >
                                                + Add Tag to Point {pointIndex + 1}
                                            </button>
                                        )}

                                        {isAddingTag && addTagPointIndex === pointIndex && (
                                            <div className="point-tag-item" style={{background: 'rgba(92, 210, 255, 0.08)', borderColor: 'rgba(92, 210, 255, 0.2)'}}>
                                                <div className="field-grid tag-add-fields">
                                                    <div className="field">
                                                        <label>Tag Type</label>
                                                        <select
                                                            value={newTagName}
                                                            onChange={(e) => {
                                                                const selectedName = e.target.value;
                                                                setNewTagName(selectedName);
                                                                // Set default values based on tag type
                                                                const template = TAG_TEMPLATES.find((entry) => entry.name === selectedName);
                                                                if (template && template.defaultValue !== undefined) {
                                                                    setNewTagValue(template.defaultValue);
                                                                } else {
                                                                    setNewTagValue("");
                                                                }
                                                            }}
                                                            autoFocus
                                                        >
                                                            <option value="">-- Select Tag Type --</option>
                                                            {TAG_TEMPLATES.map((template) => (
                                                                <option key={template.name} value={template.name}>
                                                                    {template.name}{template.unit ? ` - ${template.unit}` : ""}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="field">
                                                        <label>Value source</label>
                                                        <select
                                                            value={newTagValueSource}
                                                            onChange={(e) => {
                                                                const source = e.target.value;
                                                                setNewTagValueSource(source);
                                                                if (source !== "global") setNewTagGlobalName("");
                                                            }}
                                                        >
                                                            <option value="manual">Manual</option>
                                                            <option value="global" disabled={!globalVars?.length}>Global variable</option>
                                                        </select>
                                                    </div>
                                                    <div className="field">
                                                        <label>{newTagValueSource === "global" ? "Global variable" : "Value"}</label>
                                                        {newTagValueSource === "global" ? (
                                                            <select
                                                                value={newTagGlobalName}
                                                                onChange={(e) => setNewTagGlobalName(e.target.value)}
                                                            >
                                                                <option value="">-- Select global --</option>
                                                                {globalVars?.map((entry) => (
                                                                    <option key={entry.name} value={entry.name}>
                                                                        {entry.name}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <input
                                                                type="number"
                                                                {...tagValueBounds(newTagName)}
                                                                value={newTagValue}
                                                                onChange={(e) => {
                                                                    const raw = e.target.value;
                                                                    setNewTagValue(raw === "" || raw === "-" ? raw : String(clampTagValue(newTagName, raw)));
                                                                }}
                                                                placeholder="0"
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="point-tag-actions">
                                                    <button
                                                        className="btn primary"
                                                        onClick={() => {
                                                            if (newTagName.trim() && onAddTag) {
                                                                const value = clampTagValue(newTagName, newTagValue);
                                                                const index = Math.max(1, Math.min(pointsCount, Number(newTagPointIndex) || pointIndex + 1));
                                                                const globalName = newTagValueSource === "global" ? newTagGlobalName : undefined;
                                                                if (newTagValueSource !== "global" || globalName) {
                                                                    onAddTag(newTagName.trim(), value, index, globalName);
                                                                }
                                                                setNewTagName("");
                                                                setNewTagValue("");
                                                                setNewTagPointIndex("");
                                                                setNewTagValueSource("manual");
                                                                setNewTagGlobalName("");
                                                                setIsAddingTag(false);
                                                                setAddTagPointIndex(null);
                                                            }
                                                        }}
                                                        disabled={!newTagName.trim() || (newTagValueSource === "global" && !newTagGlobalName)}
                                                    >
                                                        Add Tag
                                                    </button>
                                                    <button
                                                        className="btn ghost"
                                                        onClick={() => {
                                                            setNewTagName("");
                                                            setNewTagValue("");
                                                            setNewTagPointIndex("");
                                                            setNewTagValueSource("manual");
                                                            setNewTagGlobalName("");
                                                            setIsAddingTag(false);
                                                            setAddTagPointIndex(null);
                                                        }}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                )}
                                    </div>
                        );
                    })}
                    </>
                </section>

                <section className="control-card">
                    <div className="card-header">
                        <h3>Path Actions</h3>
                        <p>Save, share, and manage the working path.</p>
                    </div>
                    <div className="card-actions stack">
                        {importError && (
                            <div className="status-line fail" role="alert">
                                <span>{importError}</span>
                                <button className="status-dismiss" onClick={onDismissImportError} aria-label="Dismiss import error">×</button>
                            </div>
                        )}
                        <div className="action-grid">
                            <button className="btn ghost" onClick={onExportPath}>
                                Export JSON
                            </button>
                            <button className="btn ghost" onClick={() => fileInputRef.current?.click()}>
                                Import JSON
                            </button>
                            <button className="btn ghost" onClick={onCopy}>
                                {copied ? "Copied!" : "Copy Java code"}
                            </button>
                            <button
                                className="btn ghost"
                                onClick={onSwitchSides}
                                disabled={pointsCount === 0}
                                title="Mirror all points across the field and flip the alliance"
                            >
                                Switch sides
                            </button>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="application/json,.json"
                            style={{display: "none"}}
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) onImportFile(f);
                                e.currentTarget.value = "";
                            }}
                        />
                        <div className="field">
                            <label>Alliance</label>
                            <select
                                value={alliance}
                                onChange={(e) => onAllianceChange?.(e.target.value)}
                            >
                                <option value="red">Red</option>
                                <option value="blue">Blue</option>
                            </select>
                        </div>
                        <div className="action-grid">
                            <button className="btn ghost" onClick={onUndo} disabled={!canUndo} title="Undo (Cmd/Ctrl+Z)">
                                Undo
                            </button>
                            <button className="btn ghost" onClick={onRedo} disabled={!canRedo} title="Redo (Cmd/Ctrl+Shift+Z)">
                                Redo
                            </button>
                        </div>
                        <button className="btn ghost danger-text" onClick={onClear} disabled={pointsCount === 0}>
                            Clear path
                        </button>
                        <p className="helper-text">
                            Clear is undoable — Cmd/Ctrl+Z brings the path back.
                        </p>
                    </div>
                </section>
            </div>
        </aside>
    );
}



const formatNumber = (value, precision = 3) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return "";
    const fixed = num.toFixed(precision);
    return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
};

const NumberField = ({value, step = "0.1", onCommit}) => {
    const [draft, setDraft] = useState(formatNumber(value));

    useEffect(() => {
        setDraft(formatNumber(value));
    }, [value]);

    const commitValue = () => {
        if (draft === "" || draft === "-") {
            setDraft(formatNumber(value));
            return;
        }
        const next = Number(draft);
        if (!Number.isFinite(next)) {
            setDraft(formatNumber(value));
            return;
        }
        onCommit?.(next);
    };

    return (
        <input
            type="text"
            inputMode="decimal"
            step={step}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitValue}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    commitValue();
                    e.currentTarget.blur();
                }
            }}
        />
    );
};
const Stat = ({label, value}) => (
    <div className="stat-card">
        <span className="small stat-label">{label}</span>
        <strong>{value}</strong>
    </div>
);

const toFixed = (value, precision = 1) => Number(value || 0).toFixed(precision);




















