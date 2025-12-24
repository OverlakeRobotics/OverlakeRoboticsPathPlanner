import {useEffect, useState} from "react";

const defaultSectionOrder = [
    "edit",
    "segment",
    "heading",
    "start",
    "globals",
    "motion",
];

export default function BuildPanel({
                                       shapeType,
                                       setShapeType,
                                       drawMode,
                                       setDrawMode,
                                       headingMode,
                                       setHeadingMode,
                                       endHeading,
                                       setEndHeading,
                                       velocity,
                                       setVelocity,
                                       // NEW:
                                       maxAccel,
                                       setMaxAccel,
                                       tolerance,
                                       setTolerance,
                                       snapInches,
                                       setSnapInches,
                                       startPose,
                                       setStartPose,
                                       placeStart,
                                       togglePlaceStart,
                                       useLivePose,
                                       livePoseAvailable,
                                       tagName,
                                       setTagName,
                                       tagValue,
                                       setTagValue,
                                       tagValueSource,
                                       setTagValueSource,
                                       tagGlobalName,
                                       setTagGlobalName,
                                       tagPointIndex,
                                       setTagPointIndex,
                                       addTag,
                                       pointsLength,
                                       editMode,
                                       toggleEditMode,
                                       selectedPointIndices,
                                       setSelectedPointIndices,
                                       updatePoint,
                                       deletePoint,
                                       deletePoints,
                                       points,
                                       tags,
                                       onRemoveTag,
                                       onEditTag,
                                       globalVars = [],
                                       onAddGlobalVar,
                                       onUpdateGlobalVar,
                                       onRemoveGlobalVar,
                                       onOpenSettings,
                                   }) {
    const [openSections, setOpenSections] = useState({
        segment: true,
        heading: true,
        start: false,
        motion: false,
        globals: false,
    });
    const [newGlobalName, setNewGlobalName] = useState("");
    const [newGlobalValue, setNewGlobalValue] = useState("");
    const toggleSection = (key) => {
        setOpenSections((prev) => ({...prev, [key]: !prev[key]}));
    };

    const handleToggleKey = (event, key) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleSection(key);
        }
    };
    
    // Helper to get selected point (first if multi-select)
    const selectedPointIndex = selectedPointIndices?.length === 1 ? selectedPointIndices[0] : null;
    const hasMultiSelection = selectedPointIndices?.length > 1;
    // Section components
    const renderEditSection = () => (
        <section key="edit" className="control-card">
            <div className="card-header">
                <div>
                    <h3>Edit Mode</h3>
                    <p>Enable to select and modify existing points.</p>
                </div>
            </div>
            <button
                className={`btn ${editMode ? "primary" : "ghost"}`}
                onClick={toggleEditMode}
            >
                {editMode ? "Edit Mode Active" : "Enable Edit Mode"}
            </button>
            {editMode && hasMultiSelection && (
                <div className="field-grid">
                    <div className="helper-text">
                        {selectedPointIndices.length} points selected
                    </div>
                    
                    <div className="selected-points-list" style={{display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', padding: '4px'}}>
                        {[...selectedPointIndices].sort((a,b) => a-b).map(index => (
                            <div key={index} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: '6px'}}>
                                <span>Point #{index + 1}</span>
                                <button 
                                    className="btn ghost small" 
                                    onClick={() => setSelectedPointIndices(prev => prev.filter(i => i !== index))}
                                    title="Deselect"
                                    style={{padding: '2px 6px', minHeight: 'auto', marginLeft: '8px'}}
                                >
                                    x
                                </button>
                            </div>
                        ))}
                    </div>

                    <button
                        className="btn danger"
                        onClick={() => deletePoints(selectedPointIndices)}
                    >
                        Delete {selectedPointIndices.length} Points
                    </button>
                </div>
            )}
            {editMode && selectedPointIndex !== null && !hasMultiSelection && (
                <div className="field-grid">
                    <div className="field">
                        <label>Point #{selectedPointIndex + 1} - X (in)</label>
                        <NumberField
                            value={points[selectedPointIndex]?.x ?? 0}
                            step="0.1"
                            onCommit={(value) => updatePoint(selectedPointIndex, { x: value })}
                        />
                    </div>
                    <div className="field">
                        <label>Y (in)</label>
                        <NumberField
                            value={points[selectedPointIndex]?.y ?? 0}
                            step="0.1"
                            onCommit={(value) => updatePoint(selectedPointIndex, { y: value })}
                        />
                    </div>
                    <div className="field">
                        <label>Heading (deg)</label>
                        <NumberField
                            value={points[selectedPointIndex]?.h ?? 0}
                            step="1"
                            onCommit={(value) => updatePoint(selectedPointIndex, { h: value })}
                        />
                    </div>
                    <button
                        className="btn danger"
                        onClick={() => deletePoint(selectedPointIndex)}
                    >
                        Delete Point
                    </button>
                </div>
            )}
            {editMode && selectedPointIndices?.length === 0 && pointsLength > 0 && (
                <p className="helper-text">Click to select, drag to marquee select. Stacked points are auto-selected together.</p>
            )}
        </section>
    );
    
    const renderSegmentSection = () => (
        <section key="segment" className="control-card">
            <div
                className="card-header collapsible"
                role="button"
                tabIndex={0}
                aria-expanded={openSections.segment}
                aria-controls="segment-card"
                onClick={() => toggleSection("segment")}
                onKeyDown={(event) => handleToggleKey(event, "segment")}
            >
                <div>
                    <h3>Segment Shape</h3>
                    <p>Select the geometry for new placements.</p>
                </div>
                <span className="collapse-caret">{openSections.segment ? "\u25BE" : "\u25B8"}</span>
            </div>
            {openSections.segment && (
                <>
                    <div className="button-group" id="segment-card">
                        <SegmentButton label="Line" active={shapeType === "line"} onClick={() => setShapeType("line")} />
                        <SegmentButton label="Draw" active={shapeType === "draw"} onClick={() => setShapeType("draw")} />
                        <SegmentButton label="Bezier Curve" active={shapeType === "bezier"} onClick={() => setShapeType("bezier")} />
                        <SegmentButton label="Circular Arc" active={shapeType === "arc"} onClick={() => setShapeType("arc")} />
                    </div>
                    {shapeType === "draw" && (
                        <div className="draw-type">
                            <div className="draw-type-label">Draw Type</div>
                            <div className="draw-type-group">
                            <SegmentButton label="Bezier" active={drawMode === "bezier"} onClick={() => setDrawMode("bezier")} />
                            <SegmentButton label="Arc" active={drawMode === "arc"} onClick={() => setDrawMode("arc")} />
                            <SegmentButton label="Free" active={drawMode === "free"} onClick={() => setDrawMode("free")} />
                        </div>
                        </div>
                    )}
                </>
            )}
        </section>
    );
    
    const renderHeadingSection = () => (
        <section key="heading" className="control-card">
            <div
                className="card-header collapsible"
                role="button"
                tabIndex={0}
                aria-expanded={openSections.heading}
                aria-controls="heading-card"
                onClick={() => toggleSection("heading")}
                onKeyDown={(event) => handleToggleKey(event, "heading")}
            >
                <div>
                    <h3>Heading Strategy</h3>
                    <p>Determine how headings are generated for each point.</p>
                </div>
                <span className="collapse-caret">{openSections.heading ? "\u25BE" : "\u25B8"}</span>
            </div>
            {openSections.heading && (
                <div className="button-group compact" id="heading-card">
                    <SegmentButton label="Straight" active={headingMode === "straight"} onClick={() => setHeadingMode("straight")} />
                    <SegmentButton label="Tangent" active={headingMode === "tangent"} onClick={() => setHeadingMode("tangent")} />
                    <SegmentButton label="Orthogonal L" active={headingMode === "orth-left"} onClick={() => setHeadingMode("orth-left")} />
                    <SegmentButton label="Orthogonal R" active={headingMode === "orth-right"} onClick={() => setHeadingMode("orth-right")} />
                    {headingMode === "straight" && (
                        <div className="field">
                            <label>Desired end Heading (deg)</label>
                            <input
                                type="text"
                                value={String(endHeading)}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    if (value === "" || value === "-") {
                                        setEndHeading(value);
                                        return;
                                    }
                                    const parsed = parseFloat(value);
                                    if (!Number.isNaN(parsed)) setEndHeading(parsed);
                                }}
                            />
                        </div>
                    )}
                </div>
            )}
        </section>
    );
    
    const renderStartSection = () => (
        <section key="start" className="control-card">
            <div
                className="card-header collapsible"
                role="button"
                tabIndex={0}
                aria-expanded={openSections.start}
                aria-controls="start-card"
                onClick={() => toggleSection("start")}
                onKeyDown={(event) => handleToggleKey(event, "start")}
            >
                <div>
                    <h3>Start Pose</h3>
                    <p>Define where the robot begins on the field.</p>
                </div>
                <span className="collapse-caret">{openSections.start ? "\u25BE" : "\u25B8"}</span>
            </div>
            {openSections.start && (
                <div className="field-grid three" id="start-card">
                    <Field label="X (in)">
                        <input type="text" value={String(startPose.x)} onChange={(event) => handlePoseChange(event.target.value, "x", setStartPose)} />
                    </Field>
                    <Field label="Y (in)">
                        <input type="text" value={String(startPose.y)} onChange={(event) => handlePoseChange(event.target.value, "y", setStartPose)} />
                    </Field>
                    <Field label="Heading (deg)">
                        <input type="text" value={String(startPose.h)} onChange={(event) => handlePoseChange(event.target.value, "h", setStartPose)} />
                    </Field>
                </div>
            )}
            <div className="card-actions">
                <button className={`btn callout ${placeStart ? "callout-active" : ""}`} onClick={togglePlaceStart}>
                    {placeStart ? "Click on field to set start" : "Place start on field"}
                </button>
                <button className="btn callout secondary" onClick={useLivePose} disabled={!livePoseAvailable}>
                    Use live robot pose
                </button>
            </div>
        </section>
    );
    
    const renderMotionSection = () => (
        <section key="motion" className="control-card">
            <div
                className="card-header collapsible"
                role="button"
                tabIndex={0}
                aria-expanded={openSections.motion}
                aria-controls="motion-card"
                onClick={() => toggleSection("motion")}
                onKeyDown={(event) => handleToggleKey(event, "motion")}
            >
                <div>
                    <h3>Motion & Placement</h3>
                    <p>Match drivetrain performance and snapping preferences.</p>
                </div>
                <span className="collapse-caret">{openSections.motion ? "\u25BE" : "\u25B8"}</span>
            </div>
            {openSections.motion && (
                <div className="field-grid" id="motion-card">
                    <Field label="Velocity (in/s)">
                        <input type="number" min={1} max={200} step={1} value={velocity} onChange={(event) => setVelocity(event.target.value)} />
                    </Field>
                    <Field label="Max accel (in/s^2)">
                        <input type="number" min={1} max={400} step={1} value={maxAccel} onChange={(event) => setMaxAccel(event.target.value)} />
                    </Field>
                    <Field label="Tolerance (in)">
                        <input type="number" min={0} step={0.1} value={tolerance} onChange={(event) => setTolerance(event.target.value)} />
                    </Field>
                    <Field label="Snap (in)">
                        <input type="number" min={0} step={0.1} value={snapInches} onChange={(event) => setSnapInches(event.target.value)} />
                    </Field>
                </div>
            )}
        </section>
    );

    const renderGlobalsSection = () => (
        <section key="globals" className="control-card"> 
            <div
                className="card-header collapsible"
                role="button"
                tabIndex={0}
                aria-expanded={openSections.globals}
                aria-controls="globals-card"
                onClick={() => toggleSection("globals")}
                onKeyDown={(event) => handleToggleKey(event, "globals")}
            >
                <div>
                    <h3>Global Variables</h3>
                    <p>Share values across tags.</p>
                </div>
                <span className="collapse-caret">{openSections.globals ? "\u25BE" : "\u25B8"}</span>
            </div>
            {openSections.globals && (
                <div id="globals-card">
                    <div className="field-grid">
                        <Field label="Name">
                            <input
                                type="text"
                                placeholder="e.g. speed"
                                value={newGlobalName}
                                onChange={(event) => setNewGlobalName(event.target.value)}
                            />
                        </Field>
                        <Field label="Value">
                            <input
                                type="number"
                                step={0.1}
                                placeholder="0"
                                value={newGlobalValue}
                                onChange={(event) => setNewGlobalValue(event.target.value)}
                            />
                        </Field>
                    </div>
                    <button
                        className="btn primary"
                        onClick={() => {
                            const name = newGlobalName.trim();
                            if (!name) return;
                            onAddGlobalVar?.(name, newGlobalValue);
                            setNewGlobalName("");
                            setNewGlobalValue("");
                        }}
                        disabled={!newGlobalName.trim()}
                        style={{width: '100%'}}
                    >
                        Add Global Variable
                    </button>

                    {globalVars.length > 0 ? (
                        <div className="point-tag-list" style={{marginTop: '0.75rem'}}>
                            {globalVars.map((entry) => (
                                <div key={entry.name} className="point-tag-item">
                                    <div className="point-tag-header">
                                        <div style={{flex: 1, minWidth: 0}}>
                                            <span className="point-tag-name">{entry.name}</span>
                                        </div>
                                    </div>
                                    <div className="field-grid">
                                        <Field label="Value">
                                            <input
                                                type="number"
                                                step={0.1}
                                                value={entry.value}
                                                onChange={(event) => onUpdateGlobalVar?.(entry.name, event.target.value)}
                                            />
                                        </Field>
                                    </div>
                                    <div className="point-tag-actions">
                                        <button
                                            className="btn danger"
                                            onClick={() => onRemoveGlobalVar?.(entry.name)}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="helper-text">No global variables yet.</p>
                    )}
                </div>
            )}
        </section>
    );

    // Map section IDs to render functions
    const sectionRenderers = {
        edit: renderEditSection,
        segment: renderSegmentSection,
        heading: renderHeadingSection,
        start: renderStartSection,
        motion: renderMotionSection,
        globals: renderGlobalsSection,
        
    };

    return (
        <aside className="panel panel-build">
            <div className="panel-header">
                <h2>Planner Controls</h2>
                <button className="btn ghost small" onClick={onOpenSettings} title="Open Settings">
                    Setup
                </button>
            </div>
            <div className="panel-body scroll-area">
                {defaultSectionOrder.map(sectionId => sectionRenderers[sectionId]?.())}
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
const SegmentButton = ({label, active, onClick}) => (
    <button className={`btn pill ${active ? "pill-active" : ""}`} onClick={onClick}>
        {label}
    </button>
);

const Field = ({label, children}) => (
    <div className="field">
        <label>{label}</label>
        {children}
    </div>
);

function handlePoseChange(value, key, setPose) {
    if (value === "" || value === "-") {
        setPose((prev) => ({...prev, [key]: value}));
        return;
    }
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed)) {
        setPose((prev) => ({...prev, [key]: key === "h" ? normalizeHeading(parsed) : parsed}));
    }
}

function normalizeHeading(angle) {
    let a = angle % 360;
    if (a > 180) a -= 360;
    if (a <= -180) a += 360;
    return a;
}

























