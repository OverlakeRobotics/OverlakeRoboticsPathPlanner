import {useRef, useMemo, useState} from "react";
import WaypointsDropdown from "../WaypointsDropdown";
import TAG_REGISTRY from "../../constants/tags";

const uploadLabel = (status) =>
    status === "sending" ? "⏳ Uploading…" : status === "ok" ? "✓ Uploaded" : status === "fail" ? "✗ Failed" : "📤 Upload";

const uploadClass = (status) =>
    status === "ok" ? "btn ok" : status === "fail" ? "btn danger" : status === "sending" ? "btn warn" : "btn primary";

const runLabel = (status) =>
    status === "sending" ? "⏳ Queuing…" : status === "ok" ? "✓ Queued" : status === "fail" ? "✗ Failed" : "▶️ Run";

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
                                     estTimeSec,
                                                 onExportPath,
                                                 onImportFile,
                                                 onUpdateTag,
                                                 onAddTag,
                              // new props for waypoint dropdown
                              points,
                              setPoints,
                              selectedPointIndex,
                              onPointSelect,
                              setPlacePointIndex,
                                 }) {
    const [editing, setEditing] = useState(null); // {scope: 'top'|'point', tagIndex, pointIndex, tagIdx, form}
    const [addingTagForPoint, setAddingTagForPoint] = useState(null);
    const [collapsedPoints, setCollapsedPoints] = useState(() => {
        const map = {};
        (points || []).forEach((p, i) => {
            if (Array.isArray(p.tags) && p.tags.length > 0) map[i] = true;
        });
        return map;
    });
    const [selectedTagId, setSelectedTagId] = useState("");
    const [tagParams, setTagParams] = useState({});
    const [showTagsDebug, setShowTagsDebug] = useState(false);
    const selectRef = useRef(null);
    const [dragInfo, setDragInfo] = useState(null); // {fromPoint, fromIdx}
    const [dragOver, setDragOver] = useState(null); // {toPoint, toIdx}

    const handleDragStart = (e, fromPoint, fromIdx) => {
        setDragInfo({fromPoint, fromIdx});
        try {
            e.dataTransfer.setData('text/plain', JSON.stringify({fromPoint, fromIdx}));
            e.dataTransfer.effectAllowed = 'move';
        } catch (err) {}
    };

    const handleDragOver = (e, toPoint, toIdx) => {
        e.preventDefault();
        setDragOver({toPoint, toIdx});
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e, toPoint, toIdx) => {
        e.preventDefault();
        let info = dragInfo;
        try {
            const raw = e.dataTransfer.getData('text/plain');
            if (raw) info = JSON.parse(raw);
        } catch (err) {}
        if (!info) {
            setDragInfo(null);
            setDragOver(null);
            return;
        }
        const {fromPoint, fromIdx} = info;
        const destPoint = toPoint;
        const destIdx = toIdx;
        if (fromPoint == null || fromIdx == null) return;

        setPoints(prev => {
            if (!Array.isArray(prev)) return prev;
            const next = prev.map(p => ({...p, tags: Array.isArray(p.tags) ? [...p.tags] : []}));

            // bounds check
            if (!next[fromPoint] || !Array.isArray(next[fromPoint].tags) || fromIdx < 0 || fromIdx >= next[fromPoint].tags.length) return prev;

            const moving = next[fromPoint].tags.splice(fromIdx, 1)[0];

            // adjust dest index if source and dest are same point and source index was before dest
            let insertIdx = destIdx;
            if (fromPoint === destPoint) {
                if (fromIdx < destIdx) insertIdx = Math.max(0, destIdx - 1);
            }

            if (!next[destPoint]) {
                // if dest point missing, push to end
                return next;
            }

            next[destPoint].tags = next[destPoint].tags || [];
            // if destIdx is null or out of bounds, push to end
            if (insertIdx == null || insertIdx < 0 || insertIdx > next[destPoint].tags.length) {
                next[destPoint].tags.push(moving);
            } else {
                next[destPoint].tags.splice(insertIdx, 0, moving);
            }

            return next;
        });

        setDragInfo(null);
        setDragOver(null);
    };

    const handleDragEnd = () => {
        setDragInfo(null);
        setDragOver(null);
    };
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
                {/* PLAYBACK - Primary Action Area */}
                <section className="control-card" style={{background: 'rgba(79, 195, 247, 0.06)'}}>
                    <div className="card-header">
                        <h3>🎬 Playback</h3>
                        <p>Preview the route before committing to the field.</p>
                    </div>
                    <div
                        className="card-actions"
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                            gap: 'var(--space-md)',
                            alignItems: 'center'
                        }}
                    >
                        <button
                            className={playState === "playing" ? "btn callout secondary" : "btn callout"}
                            onClick={onTogglePlay}
                            style={{
                                height: 'var(--button-height-lg)',
                                fontSize: 'var(--text-lg)',
                                fontWeight: 'var(--font-weight-bold)',
                                width: '100%'
                            }}
                        >
                            {playState === "playing" ? "⏸️ Pause preview" : "▶️ Play preview"}
                        </button>
                        <button className="btn ghost" onClick={onStop} style={{width: '100%'}}>
                            ⏹️ Stop
                        </button>
                    </div>
                    
                    {/* Enhanced Statistics Display */}
                    <div
                        className="stat-grid"
                        style={{
                            marginTop: 'var(--space-md)',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                            gap: 'var(--space-sm)'
                        }}
                    >
                        <StatCard icon="📍" label="Points" value={pointsCount} color="rgba(79, 195, 247, 0.1)" />
                        <StatCard icon="📏" label="Length (in)" value={lengthDisplay} color="rgba(102, 187, 106, 0.1)" />
                        <StatCard icon="⏱️" label="Est. time (s)" value={timeDisplay} color="rgba(255, 167, 38, 0.1)" />
                    </div>
                    
                    {/* Enhanced Progress Display */}
                    {totalLength > 0 && (
                        <div style={{
                            marginTop: 'var(--space-lg)',
                            display: 'grid',
                            gap: 'var(--space-sm)'
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'baseline'
                            }}>
                                <span style={{
                                    fontSize: 'var(--text-sm)',
                                    fontWeight: 'var(--font-weight-semibold)',
                                    color: 'var(--text-secondary)',
                                    textTransform: 'uppercase',
                                    letterSpacing: 'var(--letter-spacing-wider)'
                                }}>
                                    Progress
                                </span>
                                <span style={{
                                    fontSize: 'var(--text-xl)',
                                    fontWeight: 'var(--font-weight-bold)',
                                    color: 'var(--color-primary-light)'
                                }}>
                                    {progress}%
                                </span>
                            </div>
                            <div style={{
                                height: '8px',
                                background: 'rgba(255, 255, 255, 0.08)',
                                borderRadius: 'var(--radius-full)',
                                overflow: 'hidden',
                                border: '1px solid var(--border-default)'
                            }}>
                                <div style={{
                                    height: '100%',
                                    width: `${progress}%`,
                                    background: `linear-gradient(90deg, var(--color-primary), var(--color-success))`,
                                    transition: 'width 0.3s var(--ease-out)',
                                    boxShadow: progress > 0 ? '0 0 8px rgba(79, 195, 247, 0.5)' : 'none'
                                }} />
                            </div>
                            <span style={{
                                fontSize: 'var(--text-sm)',
                                color: 'var(--text-tertiary)',
                                textAlign: 'center'
                            }}>
                                {toFixed(playDist, 1)} / {lengthDisplay} in
                            </span>
                        </div>
                    )}

                    {/* Advanced Tags Debug Panel - Live Updates */}
                    <div style={{marginTop: 'var(--space-lg)', borderTop: '1px solid var(--border-default)', paddingTop: 'var(--space-md)'}}>
                        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 'var(--space-sm)'}}>
                            <div style={{display:'flex', alignItems:'center', gap: 'var(--space-sm)'}}>
                                <h4 style={{margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontWeight: 'var(--font-weight-semibold)'}}>
                                    🐛 Live Tags Debug
                                </h4>
                                {showTagsDebug && (
                                    <span style={{
                                        fontSize: '10px',
                                        padding: '2px 6px',
                                        background: 'rgba(76, 175, 80, 0.2)',
                                        color: 'var(--color-success-light)',
                                        borderRadius: 'var(--radius-sm)',
                                        fontWeight: 'var(--font-weight-semibold)'
                                    }}>
                                        LIVE
                                    </span>
                                )}
                            </div>
                            <button
                                className="btn ghost"
                                onClick={() => setShowTagsDebug(!showTagsDebug)}
                                style={{fontSize: '11px', padding: '4px 8px'}}
                            >
                                {showTagsDebug ? '▾ Hide' : '▸ Show'}
                            </button>
                        </div>
                        {showTagsDebug && (
                            <div style={{
                                marginTop: 'var(--space-sm)',
                                padding: 'var(--space-md)',
                                background: 'rgba(15, 23, 42, 0.7)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-subtle)',
                                maxHeight: '400px',
                                overflowY: 'auto',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '12px',
                                lineHeight: '1.6'
                            }}>
                                {points && points.length > 0 ? (
                                    <div style={{display: 'grid', gap: 'var(--space-md)'}}>
                                        {points.map((p, pi) => {
                                            const hasTags = Array.isArray(p.tags) && p.tags.length > 0;
                                            return (
                                                <div key={`debug-${pi}`} style={{
                                                    padding: 'var(--space-sm)',
                                                    background: 'rgba(255, 255, 255, 0.03)',
                                                    borderRadius: 'var(--radius-sm)',
                                                    border: '1px solid rgba(255, 255, 255, 0.06)'
                                                }}>
                                                    <div style={{
                                                        fontWeight: 'var(--font-weight-bold)',
                                                        color: 'var(--color-primary-light)',
                                                        marginBottom: 'var(--space-xs)'
                                                    }}>
                                                        Point {pi + 1} {p.label ? `(${p.label})` : ''}
                                                    </div>
                                                    <div style={{color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)'}}>
                                                        Position: x={toFixed(p.x, 2)}", y={toFixed(p.y, 2)}", h={toFixed(p.h ?? 0, 1)}°
                                                    </div>
                                                    {hasTags ? (
                                                        <div>
                                                            <div style={{color: 'var(--color-success-light)', marginBottom: 'var(--space-xs)'}}>
                                                                Tags ({p.tags.length}):
                                                            </div>
                                                            {p.tags.map((tag, ti) => (
                                                                <div key={`tag-${ti}`} style={{
                                                                    marginLeft: 'var(--space-md)',
                                                                    marginBottom: 'var(--space-xs)',
                                                                    paddingLeft: 'var(--space-sm)',
                                                                    borderLeft: '2px solid var(--color-primary)'
                                                                }}>
                                                                    <div style={{color: 'var(--text-primary)'}}>
                                                                        [{ti}] {tag.label || tag.id || tag.name || 'unnamed'}
                                                                    </div>
                                                                    {tag.params && Object.keys(tag.params).length > 0 && (
                                                                        <div style={{
                                                                            marginTop: '2px',
                                                                            color: 'var(--text-tertiary)',
                                                                            fontSize: '11px'
                                                                        }}>
                                                                            {Object.entries(tag.params).map(([k, v]) => {
                                                                                // Format numeric values as doubles with decimal precision
                                                                                const formattedValue = typeof v === 'number' 
                                                                                    ? v.toFixed(2) 
                                                                                    : JSON.stringify(v);
                                                                                return (
                                                                                    <div key={k} style={{marginLeft: 'var(--space-sm)'}}>
                                                                                        <span style={{color: 'var(--color-warning)'}}>{k}</span>: <span style={{color: 'var(--color-success-light)'}}>{formattedValue}</span>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    )}
                                                                    {tag.value != null && (
                                                                        <div style={{
                                                                            marginTop: '2px',
                                                                            color: 'var(--text-tertiary)',
                                                                            fontSize: '11px',
                                                                            marginLeft: 'var(--space-sm)'
                                                                        }}>
                                                                            <span style={{color: 'var(--color-warning)'}}>value</span>: <span style={{color: 'var(--color-success-light)'}}>{typeof tag.value === 'number' ? tag.value.toFixed(2) : JSON.stringify(tag.value)}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div style={{color: 'var(--text-tertiary)', fontStyle: 'italic'}}>
                                                            No tags
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div style={{color: 'var(--text-tertiary)', textAlign: 'center', padding: 'var(--space-lg)'}}>
                                        No points to debug
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </section>

                {/* ACTIONS - Upload & Run */}
                <section className="control-card">
                    <div className="card-header">
                        <h3>🚀 Actions</h3>
                        <p>Synchronize with the hub or copy generated code.</p>
                    </div>
                    <div className="card-actions stack">
                        <button className={uploadClass(uploadStatus)} onClick={onUpload}>
                            {uploadLabel(uploadStatus)}
                        </button>
                        <button className={runClass(runStatus)} onClick={onRun}>
                            {runLabel(runStatus)}
                        </button>
                        <button
                            className="btn ghost"
                            onClick={onCopy}
                            style={{
                                background: copied ? 'rgba(76, 175, 80, 0.15)' : undefined,
                                color: copied ? 'var(--color-success-light)' : undefined
                            }}
                        >
                            {copied ? "✓ Copied!" : "📋 Copy code"}
                        </button>
                    </div>
                </section>

                {/* GENERATED CODE */}
                <section className="control-card">
                    <div className="card-header">
                        <h3>💻 Generated Code</h3>
                        <p>Java code ready for your robot.</p>
                    </div>
                    <textarea
                        className="code-box"
                        readOnly
                        value={code}
                        style={{
                            minHeight: '200px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '13px',
                            lineHeight: '1.6',
                            background: 'var(--surface-0)',
                            border: '1px solid var(--border-emphasis)',
                            padding: 'var(--space-md)',
                            color: 'var(--text-primary)'
                        }}
                    />
                </section>

                {/* IMPORT / EXPORT */}
                <section className="control-card">
                    <div className="card-header">
                        <h3>💾 Import / Export</h3>
                        <p>Save or load your path configurations.</p>
                    </div>
                    <div className="card-actions stack">
                        <button
                            className="btn primary"
                            onClick={onExportPath}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 'var(--space-sm)'
                            }}
                        >
                            💾 Export JSON
                        </button>
                        <label
                            htmlFor="file-import"
                            className="btn ghost"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 'var(--space-sm)',
                                cursor: 'pointer',
                                textAlign: 'center'
                            }}
                        >
                            📂 Import JSON
                        </label>
                        <input
                            id="file-import"
                            ref={fileInputRef}
                            type="file"
                            accept="application/json,.json"
                            style={{display: 'none'}}
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) onImportFile(f);
                                e.currentTarget.value = "";
                            }}
                        />
                    </div>
                </section>

                {/* MANAGE PATH */}
                <section className="control-card">
                    <div className="card-header">
                        <h3>✏️ Manage Path</h3>
                        <p>Undo or clear points.</p>
                    </div>
                    <div className="card-actions stack">
                        <button className="btn ghost" onClick={onUndo}>
                            ↶ Undo last
                        </button>
                        <button className="btn danger" onClick={onClear}>
                            🗑️ Clear path
                        </button>
                    </div>
                    {/* Waypoints dropdown moved here */}
                    <WaypointsDropdown points={points} setPoints={setPoints} selectedPointIndex={selectedPointIndex} onPointSelect={onPointSelect} onBeginPlacePoint={(i) => setPlacePointIndex(i)} />

                    {/* Per-point tags management */}
                    <div style={{marginTop: 'var(--space-md)'}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between', marginBottom: 'var(--space-sm)'}}>
                            <h4 style={{margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)'}}>Point Tags</h4>
                            <div>
                                <button
                                    className="btn ghost"
                                    onClick={() => {
                                        // collapse every point so tag lists are hidden and replaced by a compact summary
                                        const collapsed = (points || []).reduce((acc, _p, i) => { acc[i] = true; return acc; }, {});
                                        setCollapsedPoints(collapsed);
                                    }}
                                >
                                    Collapse all
                                </button>
                            </div>
                        </div>
                        {points.map((p, pi) => {
                            const isCollapsed = !!collapsedPoints[pi];
                            return (
                                <div
                                    key={`point-tags-${pi}`}
                                    onDragOver={(e) => { e.preventDefault(); setDragOver({toPoint: pi, toIdx: (points[pi]?.tags?.length ?? 0)}); }}
                                    onDrop={(e) => handleDrop(e, pi, (points[pi]?.tags?.length ?? 0))}
                                    style={{
                                        marginTop:8,
                                        padding:8,
                                        borderRadius:8,
                                        border:'1px solid var(--border-default)',
                                        background: dragOver && dragOver.toPoint === pi ? 'rgba(79,195,247,0.03)' : 'rgba(255,255,255,0.02)'
                                    }}
                                >
                                    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
                                        <div style={{fontWeight:600}}>Point {pi + 1}{p?.label ? ` — ${p.label}` : ''}</div>
                                        <div style={{display:'flex', gap:8}}>
                                            <button
                                                className="btn ghost"
                                                onClick={() => setCollapsedPoints(prev => ({...prev, [pi]: !prev[pi]}))}
                                                aria-expanded={!isCollapsed}
                                                title={isCollapsed ? 'Expand tags' : 'Collapse tags'}
                                            >
                                                {isCollapsed ? '▸' : '▾'}
                                            </button>
                                            <button className="btn ghost" onClick={() => {
                                                // open add UI only when expanded
                                                setAddingTagForPoint(addingTagForPoint === pi ? null : pi);
                                                setSelectedTagId('');
                                                setTagParams({});
                                                // ensure expanded when adding
                                                setCollapsedPoints(prev => ({...prev, [pi]: false}));
                                            }}>
                                                ＋ Tag
                                            </button>
                                        </div>
                                    </div>

                                    {isCollapsed ? (
                                        <div style={{fontSize:11,color:'var(--text-tertiary)', padding:'2px 0'}}>Tags: {Array.isArray(p.tags) ? p.tags.length : 0}</div>
                                    ) : (
                                        <>
                                            {(Array.isArray(p.tags) && p.tags.length > 0) ? (
                                                p.tags.map((t, ti) => {
                                                    // If we're dragging over this exact spot, render an animated placeholder before the tag
                                                    const showPlaceholderBefore = dragOver && dragOver.toPoint === pi && dragOver.toIdx === ti;
                                                    const placeholder = showPlaceholderBefore ? (
                                                        <div key={`placeholder-before-${pi}-${ti}`} style={{
                                                            height: 10,
                                                            transition: 'height 140ms ease, opacity 140ms ease',
                                                            background: 'linear-gradient(90deg, rgba(79,195,247,0.18), rgba(96,165,250,0.06))',
                                                            borderRadius: 6,
                                                            marginBottom: 6,
                                                            opacity: 1
                                                        }} />
                                                    ) : null;
                                                    const displayLabel = t?.label ?? t?.id ?? t?.name ?? `tag ${ti}`;
                                                    const paramEntries = t?.params ? Object.entries(t.params) : [];
                                                    const displayParams = paramEntries.length > 0 
                                                        ? paramEntries.map(([k,v]) => `${k}: ${v}`).join(', ')
                                                        : (t?.value != null ? `value: ${t.value}` : 'no params');
                                                    return (
                                                        <div key={`pt-container-${pi}-${ti}`}>
                                                            {placeholder}
                                                            <div
                                                                key={`pt-${pi}-${ti}`}
                                                                className="tag-pill compact"
                                                                draggable={true}
                                                                onDragStart={(e) => handleDragStart(e, pi, ti)}
                                                                onDragOver={(e) => handleDragOver(e, pi, ti)}
                                                                onDrop={(e) => handleDrop(e, pi, ti)}
                                                                onDragEnd={handleDragEnd}
                                                                style={{
                                                                    display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:8,
                                                                    background: dragOver && dragOver.toPoint === pi && dragOver.toIdx === ti ? 'rgba(79,195,247,0.12)' : 'rgba(0,0,0,0.02)',
                                                                    border:'1px solid rgba(255,255,255,0.03)',
                                                                    marginBottom:6,
                                                                    cursor: 'grab',
                                                                    transition: 'transform 120ms ease'
                                                                }}
                                                            >
                                                            <div style={{flex:'0 0 auto',fontSize:12,fontWeight:600}}>{displayLabel}</div>
                                                            <div style={{flex:'1 1 auto',fontSize:12,color:'var(--text-secondary)'}}>{displayParams}</div>
                                                            <div style={{flex:'0 0 auto',display:'flex',gap:6}}>
                                                                <button className="btn ghost" onClick={() => setEditing({scope:'point', pointIndex: pi, tagIdx: ti, form:{...t}})}>Edit</button>
                                                                <button className="btn ghost" onClick={() => setPoints(prev => prev.map((pp, i) => {
                                                                    if (i !== pi) return pp;
                                                                    const nextTags = Array.isArray(pp.tags) ? pp.tags.filter((_, idx) => idx !== ti) : [];
                                                                    return {...pp, tags: nextTags};
                                                                }))}>✗</button>
                                                            </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div style={{fontSize:12,color:'var(--text-secondary)', marginBottom:8}}>
                                                    No tags for this point.
                                                    {/* If dragging and target is at index 0, show placeholder to indicate insertion */}
                                                    {dragOver && dragOver.toPoint === pi && dragOver.toIdx === 0 && (
                                                        <div style={{height:10, background:'linear-gradient(90deg, rgba(79,195,247,0.18), rgba(96,165,250,0.06))', borderRadius:6, marginTop:6}} />
                                                    )}
                                                </div>
                                            )}

                                            {addingTagForPoint === pi && (
                                                <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:6,padding:8,background:'rgba(15,23,42,0.5)',borderRadius:6}}>
                                                    {!selectedTagId ? (
                                                        <select 
                                                            ref={selectRef}
                                                            value={selectedTagId} 
                                                            onChange={(e) => {
                                                                const tagId = e.target.value;
                                                                // blur the native select to ensure the dropdown UI closes on all browsers
                                                                try { selectRef.current?.blur(); } catch(e) {}
                                                                setSelectedTagId(tagId);
                                                                const tagDef = TAG_REGISTRY.find(t => t.id === tagId);
                                                                if (tagDef) {
                                                                    const defaults = {};
                                                                    tagDef.params.forEach(p => {
                                                                        defaults[p.name] = p.default ?? '';
                                                                    });
                                                                    setTagParams(defaults);
                                                                } else {
                                                                    setTagParams({});
                                                                }
                                                            }}
                                                            style={{padding:'6px 8px',borderRadius:6}}
                                                        >
                                                            <option value="">Select a tag...</option>
                                                            {TAG_REGISTRY.map(tag => (
                                                                <option key={tag.id} value={tag.id}>{tag.label}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 8px',background:'rgba(79,195,247,0.1)',borderRadius:6}}>
                                                            <span style={{fontWeight:600,fontSize:13}}>{TAG_REGISTRY.find(t => t.id === selectedTagId)?.label ?? selectedTagId}</span>
                                                            <button 
                                                                className="btn ghost" 
                                                                onClick={() => {
                                                                    setSelectedTagId('');
                                                                    setTagParams({});
                                                                }}
                                                                style={{padding:'2px 6px',fontSize:11}}
                                                            >
                                                                Change
                                                            </button>
                                                        </div>
                                                    )}

                                                    {selectedTagId && (() => {
                                                        const tagDef = TAG_REGISTRY.find(t => t.id === selectedTagId);
                                                        return tagDef && tagDef.params.length > 0 ? (
                                                            <div style={{display:'flex',flexDirection:'column',gap:6}}>
                                                                {tagDef.params.map(param => (
                                                                    <div key={param.name} style={{display:'flex',gap:8,alignItems:'center'}}>
                                                                        <label style={{flex:'0 0 auto',fontSize:12,minWidth:80}}>{param.name}:</label>
                                                                        <input 
                                                                            type={param.type === 'number' ? 'number' : 'text'}
                                                                            value={tagParams[param.name] ?? ''}
                                                                            onChange={(e) => setTagParams(prev => ({...prev, [param.name]: param.type === 'number' ? Number(e.target.value) : e.target.value}))}
                                                                            placeholder={param.description}
                                                                            style={{flex:1,padding:'6px 8px',borderRadius:6}}
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : null;
                                                    })()}

                                                    <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                                                        <button className="btn ghost" onClick={() => { setAddingTagForPoint(null); setSelectedTagId(''); setTagParams({}); }}>Cancel</button>
                                                        <button 
                                                            className="btn" 
                                                            disabled={!selectedTagId}
                                                            onClick={() => {
                                                                const tagDef = TAG_REGISTRY.find(t => t.id === selectedTagId);
                                                                if (!tagDef) return;
                                                                setPoints(prev => prev.map((pp, i) => {
                                                                    if (i !== pi) return pp;
                                                                    const nextTags = Array.isArray(pp.tags) ? [...pp.tags] : [];
                                                                    nextTags.push({ 
                                                                        id: tagDef.id, 
                                                                        label: tagDef.label, 
                                                                        params: {...tagParams} 
                                                                    });
                                                                    return {...pp, tags: nextTags};
                                                                }));
                                                                setAddingTagForPoint(null);
                                                                setSelectedTagId('');
                                                                setTagParams({});
                                                            }}
                                                        >
                                                            Add
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })}

                        {/* Inline editor for point tags (re-used) */}
                        {editing && editing.scope === 'point' && (
                            <div style={{marginTop:8,padding:8,background:'rgba(15,23,42,0.98)',borderRadius:8,border:'1px solid rgba(148,163,184,0.06)'}}>
                                <div style={{marginBottom:8,fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>
                                    Editing: {editing.form.label ?? editing.form.id ?? 'tag'}
                                </div>
                                {editing.form.params && Object.keys(editing.form.params).length > 0 && (
                                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                                        {Object.entries(editing.form.params).map(([paramName, paramValue]) => {
                                            const tagDef = TAG_REGISTRY.find(t => t.id === editing.form.id);
                                            const paramDef = tagDef?.params.find(p => p.name === paramName);
                                            return (
                                                <div key={paramName} style={{display:'flex',gap:8,alignItems:'center'}}>
                                                    <label style={{flex:'0 0 auto',fontSize:12,minWidth:80}}>{paramName}:</label>
                                                    <input 
                                                        type={paramDef?.type === 'number' ? 'number' : 'text'}
                                                        value={paramValue ?? ''}
                                                        onChange={(e) => setEditing(prev => ({
                                                            ...prev, 
                                                            form: {
                                                                ...prev.form, 
                                                                params: {
                                                                    ...prev.form.params, 
                                                                    [paramName]: paramDef?.type === 'number' ? Number(e.target.value) : e.target.value
                                                                }
                                                            }
                                                        }))}
                                                        style={{flex:1,padding:'6px 8px',borderRadius:6}}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                <div style={{display:'flex',gap:8,marginTop:8,justifyContent:'flex-end'}}>
                                    <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
                                    <button className="btn" onClick={() => {
                                        // update point tag in points array
                                        setPoints(prev => prev.map((pp, i) => {
                                            if (i !== editing.pointIndex) return pp;
                                            const nextTags = Array.isArray(pp.tags) ? [...pp.tags] : [];
                                            nextTags[editing.tagIdx] = {...editing.form};
                                            return {...pp, tags: nextTags};
                                        }));
                                        setEditing(null);
                                    }}>Save</button>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
                
            </div>
        </aside>
    );
}

// Enhanced Stat Card Component with icon and color
const StatCard = ({icon, label, value, color}) => (
    <div
        className="stat-card"
        style={{
            background: color,
            borderColor: 'var(--border-emphasis)',
            padding: 'var(--space-md)',
            display: 'grid',
            gap: 'var(--space-xs)',
            transition: 'all var(--transition-base) var(--ease-in-out)'
        }}
    >
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
        }}>
            <span className="small stat-label">{label}</span>
            <span style={{fontSize: 'var(--text-lg)'}}>{icon}</span>
        </div>
        <strong style={{
            fontSize: 'var(--text-2xl)',
            fontWeight: 'var(--font-weight-bold)',
            color: 'var(--text-primary)'
        }}>
            {value}
        </strong>
    </div>
);

const toFixed = (value, precision = 1) => Number(value || 0).toFixed(precision);
