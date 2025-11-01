const uploadLabel = (status) =>
    status === "sending" ? "Uploading…" : status === "ok" ? "Uploaded" : status === "fail" ? "Failed Upload" : "Upload";

const uploadClass = (status) =>
    status === "ok" ? "btn ok" : status === "fail" ? "btn danger" : status === "sending" ? "btn warn" : "btn primary";

const runLabel = (status) =>
    status === "sending" ? "Queuing…" : status === "ok" ? "Queued" : status === "fail" ? "Failed Run" : "Run";

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
                                     // NEW:
                                     estTimeSec,
                                     onExportPath,
                                     onImportFile,
                                     points,
                                     onSwitchSides,
                                 }) {
    const lengthDisplay = toFixed(totalLength, 1);
    const timeDisplay = Number.isFinite(estTimeSec) ? toFixed(estTimeSec, 1) : "0.0";
    const progress = totalLength > 0 ? Math.round((playDist / totalLength) * 100) : 0;

    const fileInputRef = useRef(null);
    const [editingIndex, setEditingIndex] = useState(null);
    const [editName, setEditName] = useState("");
    const [editValue, setEditValue] = useState(0);
    const [editPointIndex, setEditPointIndex] = useState(0);
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const [expandedPoints, setExpandedPoints] = useState({});

    const [isAddingTag, setIsAddingTag] = useState(false);
    const [newTagName, setNewTagName] = useState("");
    const [newTagValue, setNewTagValue] = useState("");
    const [newTagPointIndex, setNewTagPointIndex] = useState("");

    // Group tags by point index
    const tagsByPoint = tags.reduce((acc, tag, index) => {
        const pointIndex = tag.index - 1; // Convert to 0-based
        if (!acc[pointIndex]) {
            acc[pointIndex] = [];
        }
        acc[pointIndex].push({...tag, originalIndex: index});
        return acc;
    }, {});

    const togglePointExpansion = (pointIndex) => {
        setExpandedPoints((prev) => ({
            ...prev,
            [pointIndex]: !prev[pointIndex]
        }));
    };

    return (
        <aside className="panel panel-run">
            <div className="panel-header">
                <h2>Run & Export</h2>
            </div>
            <div className="panel-body scroll-area">
                <section className="control-card">
                    <div className="card-header">
                        <h3>Actions</h3>
                        <p>Synchronize with the hub or copy generated code.</p>
                    </div>
                    <div className="card-actions stack">
                        <button className={uploadClass(uploadStatus)} onClick={onUpload}>
                            {uploadLabel(uploadStatus)}
                        </button>
                        <button className={runClass(runStatus)} onClick={onRun}>
                            {runLabel(runStatus)}
                        </button>
                        <button className="btn ghost" onClick={onCopy}>
                            {copied ? "Copied!" : "Copy code"}
                        </button>
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
              {progress}% • {toFixed(playDist, 1)} / {lengthDisplay} in
            </span>
                    </div>
                </section>

                <section className="control-card">
                    <div className="card-header">
                        <h3>Tags</h3>
                        <p>Organize actions by path point</p>
                    </div>
                    {points.length === 0 ? (
                        <p className="helper-text">Add points to the path to create tags</p>
                    ) : (
                        <>
                            {points.map((point, pointIndex) => {
                        const pointTags = tagsByPoint[pointIndex] || [];
                        const isExpanded = expandedPoints[pointIndex];

                        return (
                            <div key={pointIndex} className="point-section">
                                <div
                                    className="point-header"
                                    role="button"
                                    tabIndex={0}
                                    aria-expanded={isExpanded}
                                    onClick={() => togglePointExpansion(pointIndex)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            togglePointExpansion(pointIndex);
                                        }
                                    }}
                                >
                                    <div>
                                        <h4>Point {pointIndex + 1}</h4>
                                        <p>({point.x?.toFixed(1) || "0"}, {point.y?.toFixed(1) || "0"}){point.h !== undefined ? ` • ${point.h}°` : ""}</p>
                                        {pointTags.length > 0 && (
                                            <p className="tag-count">{pointTags.length} tag{pointTags.length !== 1 ? 's' : ''}</p>
                                        )}
                                    </div>
                                    <span className="collapse-caret">{isExpanded ? "▾" : "▸"}</span>
                                </div>

                                {isExpanded && (
                                    <div className="point-tags-content">
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
                                                                        <label>Tag Name</label>
                                                                        <input
                                                                            type="text"
                                                                            value={editName}
                                                                            onChange={(e) => setEditName(e.target.value)}
                                                                            autoFocus
                                                                        />
                                                                    </div>
                                                                    <div className="field-grid">
                                                                        <div className="field">
                                                                            <label>Value</label>
                                                                            <input
                                                                                type="number"
                                                                                value={editValue}
                                                                                onChange={(e) => setEditValue(Number(e.target.value))}
                                                                            />
                                                                        </div>
                                                                        <div className="field">
                                                                            <label>Point #</label>
                                                                            <input
                                                                                type="number"
                                                                                min="1"
                                                                                max={pointsCount}
                                                                                value={editPointIndex}
                                                                                onChange={(e) => setEditPointIndex(Number(e.target.value))}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="point-tag-actions">
                                                                        <button
                                                                            className="btn primary"
                                                                            onClick={() => {
                                                                                if (editName.trim() && onEditTag) {
                                                                                    onEditTag(tag.originalIndex, editName.trim(), editValue, editPointIndex);
                                                                                }
                                                                                setEditingIndex(null);
                                                                            }}
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
                                                                        <span className="drag-handle" title="Drag to reorder">⋮⋮</span>
                                                                        <div style={{flex: 1, minWidth: 0}}>
                                                                            <span className="point-tag-name">{tag.name}</span>
                                                                            <div className="point-tag-value">
                                                                                {tag.value} {tag.value !== tag.index && `• pt ${tag.index}`}
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
                                                            const defaults = {
                                                                velocity: 50,
                                                                pause: 1,
                                                                intake: 0,
                                                                autoAimRed: 0,
                                                                autoAimBlue: 0,
                                                                shooterVelocity: 0,
                                                                hoodAngle: 0,
                                                                launchArtifacts: 1,
                                                            };
                                                            if (defaults[selectedName] !== undefined) {
                                                                setNewTagValue(defaults[selectedName]);
                                                            }
                                                        }}
                                                        autoFocus
                                                    >
                                                        <option value="">-- Select Tag Type --</option>
                                                        <option value="velocity">velocity - Robot speed (in/s)</option>
                                                        <option value="pause">pause - Pause duration (sec)</option>
                                                        <option value="intake">intake - Intake control</option>
                                                        <option value="autoAimRed">autoAimRed - Red alliance aim</option>
                                                        <option value="autoAimBlue">autoAimBlue - Blue alliance aim</option>
                                                        <option value="shooterVelocity">shooterVelocity - Shooter speed</option>
                                                        <option value="hoodAngle">hoodAngle - Hood angle (deg)</option>
                                                        <option value="launchArtifacts">launchArtifacts - Launch duration (sec)</option>
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
                                                        />
                                                    </div>
                                                    <div className="field">
                                                        <label>Point #</label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max={pointsCount}
                                                            value={newTagPointIndex}
                                                            onChange={(e) => setNewTagPointIndex(e.target.value)}
                                                            placeholder={pointIndex + 1}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="point-tag-actions">
                                                    <button
                                                        className="btn primary"
                                                        onClick={() => {
                                                            if (newTagName.trim() && onAddTag) {
                                                                const value = Number(newTagValue) || 0;
                                                                const index = Math.max(1, Math.min(pointsCount, Number(newTagPointIndex) || pointIndex + 1));
                                                                onAddTag(newTagName.trim(), value, index);
                                                                setNewTagName("");
                                                                setNewTagValue("");
                                                                setNewTagPointIndex("");
                                                                setIsAddingTag(false);
                                                            }
                                                        }}
                                                        disabled={!newTagName.trim()}
                                                    >
                                                        Add Tag
                                                    </button>
                                                    <button
                                                        className="btn ghost"
                                                        onClick={() => {
                                                            setNewTagName("");
                                                            setNewTagValue("");
                                                            setNewTagPointIndex("");
                                                            setIsAddingTag(false);
                                                        }}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        )}
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
                        <button 
                            className="btn callout secondary" 
                            onClick={onSwitchSides}
                            disabled={pointsCount === 0}
                        >
                            🔄 Switch Sides
                        </button>
                        <p className="helper-text">
                            Flips all points vertically. Swaps autoAimRed ↔ autoAimBlue tags automatically.
                        </p>
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
                        <h3>Generated Code</h3>
                        <p>Paste into your robot's code to have the bot follow this path.</p>
                    </div>
                    <textarea className="code-box" readOnly value={code} />
                </section>
            </div>
        </aside>
    );
}

import {useRef, useState} from "react";

const Stat = ({label, value}) => (
    <div className="stat-card">
        <span className="small stat-label">{label}</span>
        <strong>{value}</strong>
    </div>
);

const toFixed = (value, precision = 1) => Number(value || 0).toFixed(precision);
