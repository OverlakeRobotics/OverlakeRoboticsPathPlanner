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

    const [isAddingTag, setIsAddingTag] = useState(false);
    const [newTagName, setNewTagName] = useState("");
    const [newTagValue, setNewTagValue] = useState("");
    const [newTagPointIndex, setNewTagPointIndex] = useState("");

    return (
        <aside className="panel panel-run">
            <div className="panel-header">
                <h2>Run &amp; Export</h2>
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
                    </div>
                    {!!tags.length && (
                        <div className="tag-list">
                            {tags.map((tag, index) => {
                                const isEditing = editingIndex === index;

                                return (
                                    <div
                                        key={`${tag.name}-${index}`}
                                        className={`tag-pill ${draggedIndex === index ? 'dragging' : ''}`}
                                        draggable={!isEditing}
                                        onDragStart={(e) => {
                                            setDraggedIndex(index);
                                            e.dataTransfer.effectAllowed = 'move';
                                        }}
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = 'move';
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            if (draggedIndex !== null && draggedIndex !== index && onReorderTags) {
                                                onReorderTags(draggedIndex, index);
                                            }
                                            setDraggedIndex(null);
                                        }}
                                        onDragEnd={() => setDraggedIndex(null)}
                                    >
                                        {isEditing ? (
                                            <>
                                                <div className="field">
                                                    <label>Name</label>
                                                    <input
                                                        type="text"
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        autoFocus
                                                    />
                                                </div>
                                                <div className="field">
                                                    <label>Value</label>
                                                    <input
                                                        type="number"
                                                        value={editValue}
                                                        onChange={(e) => setEditValue(Number(e.target.value))}
                                                    />
                                                </div>
                                                <div className="field">
                                                    <label>Point Index</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max={pointsCount}
                                                        value={editPointIndex}
                                                        onChange={(e) => setEditPointIndex(Number(e.target.value))}
                                                    />
                                                </div>
                                                <div className="tag-actions">
                                                    <button
                                                        className="btn primary"
                                                        onClick={() => {
                                                            if (editName.trim() && onEditTag) {
                                                                onEditTag(index, editName.trim(), editValue, editPointIndex);
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
                                                <div className="tag-header">
                                                    <span className="drag-handle" title="Drag to reorder">⋮⋮</span>
                                                    <span className="tag-name">{tag.name}</span>
                                                </div>
                                                <span className="tag-meta">value {tag.value} • point {tag.index}</span>
                                                <div className="tag-actions">
                                                    <button
                                                        className="btn ghost"
                                                        onClick={() => {
                                                            setEditingIndex(index);
                                                            setEditName(tag.name);
                                                            setEditValue(tag.value);
                                                            setEditPointIndex(tag.index);
                                                        }}
                                                    >
                                                        Edit
                                                    </button>
                                                    {onRemoveTag && (
                                                        <button className="btn danger" onClick={() => onRemoveTag(index)}>
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
                    )}
                    {isAddingTag && (
                            <div className="tag-pill">
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
                                        <option value="velocity">velocity - Change robot velocity (in/s)</option>
                                        <option value="pause">pause - Pause at point (seconds)</option>
                                        <option value="intake">intake - Control intake motor</option>
                                        <option value="autoAimRed">autoAimRed - Auto-aim for red alliance</option>
                                        <option value="autoAimBlue">autoAimBlue - Auto-aim for blue alliance</option>
                                        <option value="shooterVelocity">shooterVelocity - Set shooter velocity</option>
                                        <option value="hoodAngle">hoodAngle - Set hood angle (degrees)</option>
                                        <option value="launchArtifacts">launchArtifacts - Launch/shoot (seconds)</option>
                                    </select>
                                </div>
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
                                    <label>Point Index</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max={pointsCount}
                                        value={newTagPointIndex}
                                        onChange={(e) => setNewTagPointIndex(e.target.value)}
                                        placeholder={pointsCount.toString()}
                                    />
                                </div>
                                <p className="helper-text">Point index: 1 = first point, {pointsCount} = last point</p>
                                <div className="tag-actions">
                                    <button
                                        className="btn primary"
                                        onClick={() => {
                                            if (newTagName.trim() && onAddTag) {
                                                const value = Number(newTagValue) || 0;
                                                const index = Math.max(1, Math.min(pointsCount, Number(newTagPointIndex) || pointsCount));
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
                    {!isAddingTag && (
                        <button
                            className="btn pill"
                            onClick={() => setIsAddingTag(true)}
                            disabled={pointsCount === 0}
                        >
                            + Add Tag
                        </button>
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
