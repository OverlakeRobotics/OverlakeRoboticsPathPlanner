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
}) {
    const lengthDisplay = toFixed(totalLength, 1);
    const timeDisplay = totalLength > 0 ? (totalLength / Math.max(velocity || 1, 1)).toFixed(1) : "0.0";
    const progress = totalLength > 0 ? Math.round((playDist / totalLength) * 100) : 0;

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
                        <button className={`btn pill ${playState === "playing" ? "pill-active" : ""}`} onClick={onTogglePlay}>
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
                        <span className="small">{progress}% • {toFixed(playDist, 1)} / {lengthDisplay} in</span>
                    </div>
                </section>

                <section className="control-card">
                    <div className="card-header">
                        <h3>Manage Path</h3>
                        <p>Undo or clear before exporting.</p>
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
                        <h3>Generated Code</h3>
                        <p>Paste into your robot project to mirror this plan.</p>
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

                <section className="control-card">
                    <div className="card-header">
                        <h3>Legend</h3>
                    </div>
                    <div className="legend chips">
                        <span><span className="dot" style={{background: "#ffd166"}} /> Start</span>
                        <span><span className="dot" style={{background: "#cbd5e1"}} /> Waypoint</span>
                        <span><span className="dot" style={{background: "#7aa2ff"}} /> Footprint</span>
                        <span><span className="dot" style={{background: "#5cd2ff"}} /> Path line</span>
                    </div>
                </section>

                <section className="control-card">
                    <div className="card-header">
                        <h3>Workflow Tips</h3>
                    </div>
                    <ul className="tip-list">
                        <li>Place the start, choose a segment style, then click through waypoints.</li>
                        <li>Enable grid snapping for quick alignment and cleaner paths.</li>
                        <li>Tags latch to the latest waypoint—add them immediately after placing.</li>
                        <li>Preview speed lets you test timing without impacting upload velocity.</li>
                    </ul>
                </section>
            </div>
        </aside>
    );
}

const Stat = ({label, value}) => (
    <div className="stat-card">
        <span className="small stat-label">{label}</span>
        <strong>{value}</strong>
    </div>
);

const toFixed = (value, precision = 1) => Number(value || 0).toFixed(precision);
