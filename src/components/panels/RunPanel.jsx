import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { TAG_TEMPLATES } from "../../constants/config";
const uploadLabel = (status) =>
    status === "sending" ? "Uploading..." : status === "ok" ? "Uploaded" : status === "fail" ? "Failed Upload" : "Upload";

const uploadClass = (status) =>
    status === "ok" ? "btn ok" : status === "fail" ? "btn danger" : status === "sending" ? "btn warn" : "btn primary";

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
                                     velocity,
                                     playDist,
                                     code,
                                     onUndo,
                                     onClear,
                                     tags,
                                     onRemoveTag,
                                     onEditTag,
                                     onReorderTags,
                                     onAddTag,
                                     onReorderPoints,
                                     onTogglePointExpand,
                                     expandedPointIndex,
                                     onUpdatePoint,
                                     // NEW:
                                     estTimeSec,
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
                                     onInstantUploadInit,
                                     onInit,
                                     onStart,
                                     onStopOpMode,
                                     onUpdateSegmentControl,
                                     onUpdateSegmentMid,
                                     onUpdateSegmentHeadingMode,
                                 }) {
    useEffect(() => {
        console.log('[RunPanel] Rendered. isConnected:', isConnected, 'robotStatus:', robotStatus, 'disabled:', robotStatus?.status === 'RUNNING');
    }, [isConnected, robotStatus, onInit]);

    const lengthDisplay = toFixed(totalLength, 1);
    const timeDisplay = Number.isFinite(estTimeSec) ? toFixed(estTimeSec, 1) : "0.0";
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
    // Selected op mode must be chosen before initializing the robot
    const [selectedOpMode, setSelectedOpMode] = useState("");

    const [isAddingTag, setIsAddingTag] = useState(false);
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
    // Group tags by point index
    const tagsByPoint = tags.reduce((acc, tag, index) => {
        const pointIndex = tag.index - 1; // Convert to 0-based
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


    // Keep a ref to the latest robotStatus for async waiting checks
    const robotStatusRef = useRef(robotStatus);
    useEffect(() => { robotStatusRef.current = robotStatus; }, [robotStatus]);

    const waitForOpMode = (opMode, timeoutMs = 6000) => new Promise((resolve, reject) => {
        const deadline = Date.now() + timeoutMs;
        const check = () => {
            const cur = robotStatusRef.current;
            if (cur && cur.opMode && String(cur.opMode).includes(opMode)) return resolve(true);
            if (Date.now() > deadline) return reject(new Error('timeout'));
            setTimeout(check, 200);
        };
        check();
    });

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

    // Initialize selectedOpMode to "Path Planner" by default, or first available opmode when list is loaded
    useEffect(() => {
        if (!selectedOpMode) {
            setSelectedOpMode("Path Planner");
        } else if (robotConfig?.opModeList?.length > 0 && !robotConfig.opModeList.includes(selectedOpMode)) {
            // If selectedOpMode is not in the list, switch to the first available
            setSelectedOpMode(robotConfig.opModeList[0]);
        }
    }, [robotConfig?.opModeList, selectedOpMode]);

    const handleUploadClick = async () => {
        if (!selectedOpMode) {
            setDebugMsg('Select an OpMode before initializing/uploading.');
            return;
        }
        
        // If already initialized to the correct opmode, just upload
        const currentOpMode = robotStatusRef.current?.opMode || '';
        const currentStatus = robotStatusRef.current?.status || '';
        if (currentOpMode.includes(selectedOpMode) && currentStatus !== 'STOPPED') {
             setDebugMsg('Already initialized, uploading...');
             if (onUpload) onUpload();
             setHasSentInit(true);
             return;
        }

        setDebugMsg(`Initializing ${selectedOpMode}...`);
        try {
            if (onInit) onInit(selectedOpMode);
            setHasSentInit(true);
            
            // Wait for robot to report it is in the correct OpMode
            await waitForOpMode(selectedOpMode);
            
            setDebugMsg('Initialized! Uploading path...');
            // Small delay to ensure robot is ready to accept commands/files
            await new Promise(r => setTimeout(r, 500));
            
            if (onUpload) onUpload();
            setDebugMsg('Upload requested');
        } catch (e) {
            console.error(e);
            setDebugMsg('Init/Upload failed or timed out');
        }
    };
    
    const handleInitStartClick = () => {
        console.log(`[RunPanel] Init/Start Clicked. initialized: ${initialized}, hasSentInit: ${hasSentInit}`);
        if (!initialized && !hasSentInit) {
            console.log(`[RunPanel] Sending INIT with selectedOpMode: ${selectedOpMode}`);
            setDebugMsg(`Sending INIT (${selectedOpMode})...`);
            if (onInit) onInit(selectedOpMode);
            setHasSentInit(true);
            setTimeout(() => setDebugMsg('Initialized (local)'), 600);
        } else {
            console.log('[RunPanel] Sending START');
            setDebugMsg('Starting path...');
            if (onStart) onStart();
            setTimeout(() => setDebugMsg('Start requested'), 600);
        }
    };

    return (
        <aside className="panel panel-run">
            <div className="panel-header">
                <h2>Run & Export</h2>
            </div>
            <div className="panel-body scroll-area">
                <section className="control-card">
                    <div className="card-header">
                        <h3>Robot Control</h3>
                        <p>Manage robot connection and execution.</p>
                    </div>
                    <div className="card-actions stack">
                        {/* Primary Upload (INIT then Upload) */}
                        <button 
                            className={uploadClass(uploadStatus)} 
                            onClick={handleUploadClick}
                            disabled={uploadStatus === "sending"}
                        >
                            {uploadStatus === "sending" ? "Uploading..." : "Upload"}
                        </button>

                        {/* Connection & Robot Status */}
                        <div className="robot-status-panel" style={{
                            background: isConnected ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                            border: `1px solid ${isConnected ? 'rgba(74, 222, 128, 0.2)' : 'rgba(248, 113, 113, 0.2)'}`,
                            borderRadius: '6px',
                            padding: '0.75rem',
                            marginTop: '0.5rem',
                            marginBottom: '0.5rem'
                        }}>
                            {debugMsg && (
                                <div style={{marginTop: '0.5rem', fontSize: '0.85rem', opacity: 0.9}}>
                                    {debugMsg}
                                </div>
                            )}
                            <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem'}}>
                                <div style={{
                                    width: '8px', 
                                    height: '8px', 
                                    borderRadius: '50%', 
                                    background: isConnected ? '#4ade80' : '#f87171',
                                    boxShadow: isConnected ? '0 0 8px #4ade80' : 'none'
                                }} />
                                <span style={{fontSize: '0.9rem', fontWeight: 500}}>
                                    {isConnected ? "Connected to Robot" : "Disconnected"}
                                </span>
                            </div>

                            {isConnected && robotStatus && (
                                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem'}}>
                                    <div>
                                        <span style={{opacity: 0.7}}>OpMode:</span>
                                        <div style={{fontWeight: 600}}>{robotStatus.opMode}</div>
                                    </div>
                                    <div>
                                        <span style={{opacity: 0.7}}>Battery:</span>
                                        <div style={{fontWeight: 600}}>{robotStatus.battery} V</div>
                                    </div>
                                    <div style={{gridColumn: 'span 2'}}>
                                        <span style={{opacity: 0.7}}>Status:</span>
                                        <div style={{fontWeight: 600, color: robotStatus.status === 'RUNNING' ? '#4ade80' : 'inherit'}}>
                                            {robotStatus.status}
                                        </div>
                                    </div>
                                    {/* OpMode selector sourced from robotConfig.opModeList when available */}
                                            {robotConfig?.opModeList?.length > 0 && (
                                                <div style={{gridColumn: 'span 2', marginTop: '0.5rem'}}>
                                                    <label style={{display: 'block', fontSize: '0.75rem', opacity: 0.8, marginBottom: '0.25rem'}}>Select OpMode</label>
                                                    <div style={{width: '100%', maxHeight: 140, overflowY: 'auto', padding: '0.25rem', borderRadius: 6, border: '1px solid rgba(0,0,0,0.06)'}}>
                                                        {robotConfig.opModeList.map((m, i) => (
                                                            <div
                                                                key={i}
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => setSelectedOpMode(m)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedOpMode(m); }}
                                                        style={{
                                                            padding: '0.4rem',
                                                            borderRadius: 4,
                                                            cursor: 'pointer',
                                                            background: selectedOpMode === m ? 'rgba(16,185,129,0.12)' : 'transparent',
                                                            border: selectedOpMode === m ? '1px solid rgba(16,185,129,0.12)' : '1px solid transparent',
                                                            marginBottom: 4,
                                                        }}
                                                    >
                                                        {m}
                                                    </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                </div>
                            )}
                        </div>

                        {/* Execution Controls */}
                        {isConnected ? (
                            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem'}}>
                                <button
                                    className="btn ok"
                                    onClick={handleInitStartClick}
                                >
                                    {(initialized || hasSentInit) ? '? Start' : 'Init'}
                                </button>
                                <button 
                                    className="btn danger" 
                                    onClick={onStopOpMode}
                                >
                                    ⏹ Stop
                                </button>
                            </div>
                        ) : (
                            <p className="helper-text" style={{textAlign: 'center', margin: 0}}>
                                Connect to robot WiFi to enable controls
                            </p>
                        )}

                        <div className="divider" style={{height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0.5rem 0'}} />
                        
                        <button className="btn ghost" onClick={onCopy}>
                            {copied ? "Copied!" : "Copy Code to Clipboard"}
                        </button>
                    </div>
                </section>

                <section className="control-card">
                    <div className="card-header">
                        <h3>Import / Export</h3>
                        <p>Save or import path.</p>
                    </div>
                    <div className="card-actions stack">
                        <button className="btn primary" onClick={onExportPath}>
                            Export JSON
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="application/json,.json"
                            className="input"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) onImportFile(f);
                                e.currentTarget.value = "";
                            }}
                        />
                    </div>
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
                            Stop
                        </button>
                    </div>
                    <div className="stat-grid">
                        <Stat label="Points" value={pointsCount} />
                        <Stat label="Length (in)" value={lengthDisplay} />
                        <Stat label="Est. time (s)" value={timeDisplay} />
                    </div>
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
                    {points.length === 0 ? (
                        <p className="helper-text">Add points to the path to create tags</p>
                    ) : (
                        <>
                            {points.map((point, pointIndex) => {
                                const pointTags = tagsByPoint[pointIndex] || [];
                                const segment = segments?.[pointIndex];
                                const typeLabel = segment?.type === "bezier" ? "Bezier" : segment?.type === "arc" ? "Arc" : "Line";
                                const isExpanded = expandedPointIndex === pointIndex;
                                const isClosing = closingPointIndex === pointIndex;

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
                                                <div className="field-grid">
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
                                                    {segment?.type === "bezier" || segment?.type === "arc" ? (
                                                        <>
                                                            <div className="field">
                                                                <label>Heading strategy</label>
                                                                <select
                                                                    value={segment.headingMode || "straight"}
                                                                    onChange={(e) => onUpdateSegmentHeadingMode?.(pointIndex, e.target.value)}
                                                                >
                                                                    <option value="straight">Straight</option>
                                                                    <option value="tangent">Tangent</option>
                                                                    <option value="orth-left">Orthogonal L</option>
                                                                    <option value="orth-right">Orthogonal R</option>
                                                                </select>
                                                            </div>
                                                            {(segment.headingMode || "straight") === "straight" && (
                                                                <div className="field">
                                                                    <label>Heading (deg)</label>
                                                                    <NumberField
                                                                value={point.h ?? 0}
                                                                step="1"
                                                                onCommit={(value) => onUpdatePoint?.(pointIndex, { h: value })}
                                                            />
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : (
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
                                                                if (!isEditing) {
                                                                    setDraggedIndex(tag.originalIndex);
                                                                    e.dataTransfer.effectAllowed = 'move';
                                                                    e.dataTransfer.setData('text/plain', tag.originalIndex.toString());
                                                                }
                                                            }}
                                                            onDragEnter={(e) => {
                                                                e.preventDefault();
                                                                if (draggedIndex !== null && draggedIndex !== tag.originalIndex) {
                                                                    setDragOverIndex(tag.originalIndex);
                                                                }
                                                            }}
                                                            onDragLeave={(e) => {
                                                                e.preventDefault();
                                                                if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) {
                                                                    setDragOverIndex(null);
                                                                }
                                                            }}
                                                            onDragOver={(e) => {
                                                                e.preventDefault();
                                                                e.dataTransfer.dropEffect = 'move';
                                                            }}
                                                            onDrop={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                if (draggedIndex !== null && draggedIndex !== tag.originalIndex && onReorderTags) {
                                                                    onReorderTags(draggedIndex, tag.originalIndex);
                                                                }
                                                                setDraggedIndex(null);
                                                                setDragOverIndex(null);
                                                            }}
                                                            onDragEnd={() => {
                                                                setDraggedIndex(null);
                                                                setDragOverIndex(null);
                                                            }}
                                                        >
                                                            {isEditing ? (
                                                                <>
                                                                    <div className="field">
                                                                        <label>Tag</label>
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
                                                                    <div className="field-grid">
                                                                        <div className="field">
                                                                            <label>Value</label>
                                                                            <input
                                                                                type="number"
                                                                                value={editValue}
                                                                                onChange={(e) => setEditValue(Number(e.target.value))}
                                                                                disabled={editValueSource === "global"}
                                                                            />
                                                                        </div>
                                                                        <div className="field">
                                                                            <label>Value source</label>
                                                                            <select
                                                                                value={editValueSource}
                                                                                onChange={(e) => setEditValueSource(e.target.value)}
                                                                            >
                                                                                <option value="manual">Manual</option>
                                                                                <option value="global" disabled={!globalVars?.length}>Global variable</option>
                                                                            </select>
                                                                        </div>
                                                                        {editValueSource === "global" && (
                                                                            <div className="field">
                                                                                <label>Global variable</label>
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
                                                                            </div>
                                                                        )}
                                                </div>
                                                <div className="point-tag-actions">
                                                                        <button
                                                                            className="btn primary"
                                                                            onClick={() => {
                                                                                if (editName.trim() && onEditTag) {
                                                                                    const globalName = editValueSource === "global" ? editGlobalName : undefined;
                                                                                    if (editValueSource !== "global" || globalName) {
                                                                                        onEditTag(tag.originalIndex, editName.trim(), editValue, editPointIndex, globalName);
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
                                                }}
                                                disabled={pointsCount === 0}
                                                style={{width: '100%'}}
                                            >
                                                + Add Tag to Point {pointIndex + 1}
                                            </button>
                                        )}

                                        {isAddingTag && (
                                            <div className="point-tag-item" style={{background: 'rgba(92, 210, 255, 0.08)', borderColor: 'rgba(92, 210, 255, 0.2)'}}>
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
                                                <div className="field-grid">
                                                    <div className="field">
                                                        <label>Value</label>
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            value={newTagValue}
                                                            onChange={(e) => setNewTagValue(e.target.value)}
                                                            placeholder="0"
                                                            disabled={newTagValueSource === "global"}
                                                        />
                                                    </div>
                                                    <div className="field">
                                                        <label>Value source</label>
                                                        <select
                                                            value={newTagValueSource}
                                                            onChange={(e) => setNewTagValueSource(e.target.value)}
                                                        >
                                                            <option value="manual">Manual</option>
                                                            <option value="global" disabled={!globalVars?.length}>Global variable</option>
                                                        </select>
                                                    </div>
                                                    {newTagValueSource === "global" && (
                                                        <div className="field">
                                                            <label>Global variable</label>
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
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="point-tag-actions">
                                                    <button
                                                        className="btn primary"
                                                        onClick={() => {
                                                            if (newTagName.trim() && onAddTag) {
                                                                const value = Number(newTagValue) || 0;
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
                    )}
                </section>

                <section className="control-card">
                    <div className="card-header">
                        <h3>Manage Path</h3>
                        <p>Undo or clear points.</p>
                    </div>
                    <div className="card-actions stack">
                        <button className="btn ghost" onClick={onUndo}>
                            Undo last
                        </button>
                        <button className="btn danger" onClick={onClear}>
                            Clear path
                        </button>
                    </div>
                </section>

                <section className="control-card">
                    <div className="card-header">
                        <h3>Switch Sides</h3>
                        <p>Mirror path between Red and Blue Alliance.</p>
                    </div>
                    <div className="card-actions stack">
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
                        <button 
                            className="btn callout secondary" 
                            onClick={onSwitchSides}
                            disabled={pointsCount === 0}
                        >
                            Switch Sides
                        </button>
                        <p className="helper-text">
                            Mirrors all points and toggles the alliance parameter.
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








































