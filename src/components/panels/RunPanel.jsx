const uploadLabel = (status) =>
    status === "sending" ? "Uploading…" : status === "ok" ? "Uploaded" : status === "fail" ? "Failed Upload" : "Upload";

const uploadClass = (status) =>
    status === "ok" ? "btn ok" : status === "fail" ? "btn danger" : status === "sending" ? "btn warn" : "btn primary";

export default function RunPanel({
                                     onUpload,
                                     uploadStatus,
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
                                     // NEW:
                                     estTimeSec,
                                     onExportPath,
                                     onImportFile,
                                 }) {
    const lengthDisplay = toFixed(totalLength, 1);
    const timeDisplay = Number.isFinite(estTimeSec) ? toFixed(estTimeSec, 1) : "0.0";
    const progress = totalLength > 0 ? Math.round((playDist / totalLength) * 100) : 0;

    const fileInputRef = useRef(null);

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

                {!!tags.length && (
                    <section className="control-card">
                        <div className="card-header">
                            <h3>Tags</h3>
                            <p>Attached to the most recent placement.</p>
                        </div>
                        <div className="tag-list">
                            {tags.map((tag, index) => (
                                <div key={`${tag.name}-${index}`} className="tag-pill">
                                    <span>{tag.name}</span>
                                    <span className="tag-meta">value {tag.value} • point {tag.index}</span>
                                    {onRemoveTag && (
                                        <button className="btn ghost" onClick={() => onRemoveTag(index)}>
                                            Remove
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </aside>
    );
}

import {useRef} from "react";

const Stat = ({label, value}) => (
    <div className="stat-card">
        <span className="small stat-label">{label}</span>
        <strong>{value}</strong>
    </div>
);

const toFixed = (value, precision = 1) => Number(value || 0).toFixed(precision);
