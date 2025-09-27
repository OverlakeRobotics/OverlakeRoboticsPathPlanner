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
    const uploadLabel = uploadStatus === "sending" ? "Uploading…" : uploadStatus === "ok" ? "Uploaded" : uploadStatus === "fail" ? "Failed Upload" : "Upload";
    const uploadClass = uploadStatus === "ok" ? "btn ok" : uploadStatus === "fail" ? "btn danger" : uploadStatus === "sending" ? "btn warn" : "btn primary";
    const estTime = totalLength > 0 ? (totalLength / Math.max(velocity || 1, 1)).toFixed(1) : "0.0";
    const progressPct = totalLength > 0 ? Math.round((playDist / totalLength) * 100) : 0;

    return (
        <aside className="panel">
            <div className="panel-header">Run &amp; Export</div>
            <div className="panel-body scroll-area">
                <section className="section">
                    <div className="inline">
                        <button className={uploadClass} onClick={onUpload}>{uploadLabel}</button>
                        <button className="btn ghost" onClick={onCopy}>{copied ? "Copied!" : "Copy"}</button>
                    </div>
                    <div className="inline">
                        <button className={`btn ${playState === "playing" ? "primary" : ""}`} onClick={onTogglePlay}>
                            {playState === "playing" ? "⏸ Pause" : "▶ Play"}
                        </button>
                        <button className="btn danger" onClick={onStop}>
                            ⏹ Stop
                        </button>
                    </div>
                </section>

                <section className="section">
                    <h3>Path Stats</h3>
                    <div className="grid-three">
                        <Stat label="Points" value={pointsCount} />
                        <Stat label="Length (in)" value={toFixed(totalLength, 1)} />
                        <Stat label="Est. Time (s)" value={estTime} />
                    </div>
                    <div className="small">Progress: {progressPct}% • {toFixed(playDist, 1)} / {toFixed(totalLength, 1)} in</div>
                </section>

                <section className="section">
                    <h3>Copy / Export</h3>
                    <textarea className="code-box" readOnly value={code} />
                    <div className="inline">
                        <button className="btn ghost" onClick={onUndo}>
                            Undo
                        </button>
                        <button className="btn danger" onClick={onClear}>
                            Clear Path
                        </button>
                    </div>
                </section>

                {tags.length > 0 && (
                    <section className="section">
                        <h3>Tags</h3>
                        <div className="tag-list" style={{display: "grid", gap: "8px"}}>
                            {tags.map((tag, index) => (
                                <div key={`${tag.name}-${index}`} className="inline" style={{justifyContent: "space-between"}}>
                                    <span className="small">
                                        {tag.name} • value {tag.value} • point {tag.index}
                                    </span>
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

                <section className="section">
                    <h3>Legend</h3>
                    <legend className="chips">
                        <span><span className="dot" style={{background: "#ffd166"}} /> Start</span>
                        <span><span className="dot" style={{background: "#cbd5e1"}} /> Waypoint</span>
                        <span><span className="dot" style={{background: "#7aa2ff"}} /> Robot footprint</span>
                        <span><span className="dot" style={{background: "#5cd2ff"}} /> Path line</span>
                    </legend>
                </section>

                <section className="section">
                    <h3>Tips</h3>
                    <ul className="tip-list">
                        <li>Place start, pick a segment type, then click to add points.</li>
                        <li>Use Snap for cleaner placement; Tolerance carries through upload/export.</li>
                        <li>Tags attach to the latest point—add them right after placing it.</li>
                        <li>Preview speed is independent of your motion velocity.</li>
                    </ul>
                </section>
            </div>
        </aside>
    );
}

const Stat = ({label, value}) => (
    <div style={{background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px", display: "grid", gap: 4}}>
        <span className="small" style={{textTransform: "uppercase", letterSpacing: 0.75}}>{label}</span>
        <strong style={{fontSize: 18}}>{value}</strong>
    </div>
);

const toFixed = (value, precision = 1) => Number(value || 0).toFixed(precision);
