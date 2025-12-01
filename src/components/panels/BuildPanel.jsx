import {useState, useEffect, useCallback} from "react";

const SECTION_ORDER_KEY = "planner_build_panel_order";

const defaultSectionOrder = [
    "edit",
    "segment",
    "heading",
    "start",
    "motion",
    "overlay",
    "tags",
];

export default function BuildPanel({
                                       shapeType,
                                       setShapeType,
                                       headingMode,
                                       setHeadingMode,
                                       endHeading,
                                       setEndHeading,
                                       velocity,
                                       setVelocity,
                                       // NEW:
                                       maxAccel,
                                       setMaxAccel,
                                       playSpeed,
                                       setPlaySpeed,
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
                                       showGrid,
                                       setShowGrid,
                                       gridStepEntry,
                                       setGridStepEntry,
                                       commitGridStep,
                                       robotDimensions,
                                       setRobotDimensions,
                                       tagName,
                                       setTagName,
                                       tagValue,
                                       setTagValue,
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
                                       onOpenSettings,
                                   }) {
    const {length, width} = robotDimensions;
    const [openSections, setOpenSections] = useState({
        segment: true,
        heading: true,
        start: false,
        motion: false,
        overlay: false,
        tags: false,
    });
    const [expandedPoints, setExpandedPoints] = useState({});
    
    // Drag and drop state
    const [sectionOrder, setSectionOrder] = useState(() => {
        try {
            const stored = localStorage.getItem(SECTION_ORDER_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Validate the parsed order
                if (Array.isArray(parsed) && parsed.length === defaultSectionOrder.length) {
                    return parsed;
                }
            }
        } catch (e) {}
        return defaultSectionOrder;
    });
    const [draggedSection, setDraggedSection] = useState(null);
    const [dragOverSection, setDragOverSection] = useState(null);
    
    // Save order to localStorage when it changes
    useEffect(() => {
        localStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(sectionOrder));
    }, [sectionOrder]);

    const handleDragStart = useCallback((e, sectionId) => {
        setDraggedSection(sectionId);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", sectionId);
        // Add dragging class after a short delay for visual feedback
        setTimeout(() => {
            e.target.classList.add("dragging");
        }, 0);
    }, []);

    const handleDragEnd = useCallback((e) => {
        e.target.classList.remove("dragging");
        setDraggedSection(null);
        setDragOverSection(null);
    }, []);

    const handleDragOver = useCallback((e, sectionId) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (sectionId !== draggedSection) {
            setDragOverSection(sectionId);
        }
    }, [draggedSection]);

    const handleDragLeave = useCallback(() => {
        setDragOverSection(null);
    }, []);

    const handleDrop = useCallback((e, targetSectionId) => {
        e.preventDefault();
        if (!draggedSection || draggedSection === targetSectionId) return;
        
        setSectionOrder(prev => {
            const newOrder = [...prev];
            const draggedIndex = newOrder.indexOf(draggedSection);
            const targetIndex = newOrder.indexOf(targetSectionId);
            
            if (draggedIndex === -1 || targetIndex === -1) return prev;
            
            // Remove dragged item and insert at target position
            newOrder.splice(draggedIndex, 1);
            newOrder.splice(targetIndex, 0, draggedSection);
            
            return newOrder;
        });
        
        setDraggedSection(null);
        setDragOverSection(null);
    }, [draggedSection]);

    const toggleSection = (key) => {
        setOpenSections((prev) => ({...prev, [key]: !prev[key]}));
    };

    const togglePointExpansion = (pointIndex) => {
        setExpandedPoints((prev) => ({
            ...prev,
            [pointIndex]: !prev[pointIndex]
        }));
    };

    const handleToggleKey = (event, key) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleSection(key);
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
    
    // Helper to get selected point (first if multi-select)
    const selectedPointIndex = selectedPointIndices?.length === 1 ? selectedPointIndices[0] : null;
    const hasMultiSelection = selectedPointIndices?.length > 1;
    
    // Drag wrapper props for a section
    const getDragProps = (sectionId) => ({
        draggable: true,
        onDragStart: (e) => handleDragStart(e, sectionId),
        onDragEnd: handleDragEnd,
        onDragOver: (e) => handleDragOver(e, sectionId),
        onDragLeave: handleDragLeave,
        onDrop: (e) => handleDrop(e, sectionId),
        className: `control-card ${draggedSection === sectionId ? 'dragging' : ''} ${dragOverSection === sectionId ? 'drag-over' : ''}`,
    });

    // Section components
    const renderEditSection = () => (
        <section key="edit" {...getDragProps("edit")}>
            <div className="drag-handle" title="Drag to reorder">⋮⋮</div>
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
                {editMode ? "✓ Edit Mode Active" : "Enable Edit Mode"}
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
                                    ✕
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
                        <input
                            type="number"
                            step="0.1"
                            value={points[selectedPointIndex]?.x ?? ""}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === "" || val === "-") {
                                    updatePoint(selectedPointIndex, { x: 0 });
                                } else {
                                    updatePoint(selectedPointIndex, { x: parseFloat(val) || 0 });
                                }
                            }}
                        />
                    </div>
                    <div className="field">
                        <label>Y (in)</label>
                        <input
                            type="number"
                            step="0.1"
                            value={points[selectedPointIndex]?.y ?? ""}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === "" || val === "-") {
                                    updatePoint(selectedPointIndex, { y: 0 });
                                } else {
                                    updatePoint(selectedPointIndex, { y: parseFloat(val) || 0 });
                                }
                            }}
                        />
                    </div>
                    <div className="field">
                        <label>Heading (°)</label>
                        <input
                            type="number"
                            step="1"
                            value={points[selectedPointIndex]?.h ?? ""}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === "" || val === "-") {
                                    updatePoint(selectedPointIndex, { h: 0 });
                                } else {
                                    updatePoint(selectedPointIndex, { h: parseFloat(val) || 0 });
                                }
                            }}
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
        <section key="segment" {...getDragProps("segment")}>
            <div className="drag-handle" title="Drag to reorder">⋮⋮</div>
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
                <span className="collapse-caret">{openSections.segment ? "▾" : "▸"}</span>
            </div>
            {openSections.segment && (
                <div className="button-group" id="segment-card">
                    <SegmentButton label="Line" active={shapeType === "line"} onClick={() => setShapeType("line")} />
                    <SegmentButton label="Draw" active={shapeType === "draw"} onClick={() => setShapeType("draw")} />
                    <SegmentButton label="Bézier Curve" active={shapeType === "bezier"} onClick={() => setShapeType("bezier")} />
                    <SegmentButton label="Circular Arc" active={shapeType === "arc"} onClick={() => setShapeType("arc")} />
                </div>
            )}
        </section>
    );
    
    const renderHeadingSection = () => (
        <section key="heading" {...getDragProps("heading")}>
            <div className="drag-handle" title="Drag to reorder">⋮⋮</div>
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
                <span className="collapse-caret">{openSections.heading ? "▾" : "▸"}</span>
            </div>
            {openSections.heading && (
                <div className="button-group compact" id="heading-card">
                    <SegmentButton label="Straight" active={headingMode === "straight"} onClick={() => setHeadingMode("straight")} />
                    <SegmentButton label="Tangent" active={headingMode === "tangent"} onClick={() => setHeadingMode("tangent")} />
                    <SegmentButton label="Orthogonal L" active={headingMode === "orth-left"} onClick={() => setHeadingMode("orth-left")} />
                    <SegmentButton label="Orthogonal R" active={headingMode === "orth-right"} onClick={() => setHeadingMode("orth-right")} />
                    {headingMode === "straight" && (
                        <div className="field">
                            <label>Desired end heading (°)</label>
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
        <section key="start" {...getDragProps("start")}>
            <div className="drag-handle" title="Drag to reorder">⋮⋮</div>
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
                <span className="collapse-caret">{openSections.start ? "▾" : "▸"}</span>
            </div>
            {openSections.start && (
                <div className="field-grid three" id="start-card">
                    <Field label="X (in)">
                        <input type="text" value={String(startPose.x)} onChange={(event) => handlePoseChange(event.target.value, "x", setStartPose)} />
                    </Field>
                    <Field label="Y (in)">
                        <input type="text" value={String(startPose.y)} onChange={(event) => handlePoseChange(event.target.value, "y", setStartPose)} />
                    </Field>
                    <Field label="Heading (°)">
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
        <section key="motion" {...getDragProps("motion")}>
            <div className="drag-handle" title="Drag to reorder">⋮⋮</div>
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
                <span className="collapse-caret">{openSections.motion ? "▾" : "▸"}</span>
            </div>
            {openSections.motion && (
                <div className="field-grid" id="motion-card">
                    <Field label="Velocity (in/s)">
                        <input type="number" min={1} max={200} step={1} value={velocity} onChange={(event) => setVelocity(event.target.value)} />
                    </Field>
                    <Field label="Max accel (in/s²)">
                        <input type="number" min={1} max={400} step={1} value={maxAccel} onChange={(event) => setMaxAccel(event.target.value)} />
                    </Field>
                    <Field label="Preview speed (in/s)">
                        <input type="number" min={1} max={200} step={1} value={playSpeed} onChange={(event) => setPlaySpeed(event.target.value)} />
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
    
    const renderOverlaySection = () => (
        <section key="overlay" {...getDragProps("overlay")}>
            <div className="drag-handle" title="Drag to reorder">⋮⋮</div>
            <div
                className="card-header collapsible"
                role="button"
                tabIndex={0}
                aria-expanded={openSections.overlay}
                aria-controls="overlay-card"
                onClick={() => toggleSection("overlay")}
                onKeyDown={(event) => handleToggleKey(event, "overlay")}
            >
                <div>
                    <h3>Field Overlay</h3>
                    <p>Toggle gridlines and update the robot footprint.</p>
                </div>
                <span className="collapse-caret">{openSections.overlay ? "▾" : "▸"}</span>
            </div>
            {openSections.overlay && (
                <>
                    <div className="field-grid" id="overlay-card">
                        <Field label="Grid overlay">
                            <select value={showGrid ? "on" : "off"} onChange={(event) => setShowGrid(event.target.value === "on")}>
                                <option value="off">Hidden</option>
                                <option value="on">Visible</option>
                            </select>
                        </Field>
                        <Field label="Grid step (in)">
                            <input
                                type="number"
                                min={0.25}
                                step={0.25}
                                value={gridStepEntry}
                                onChange={(event) => setGridStepEntry(event.target.value)}
                                onBlur={commitGridStep}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        commitGridStep();
                                        event.currentTarget.blur();
                                    }
                                }}
                                disabled={!showGrid}
                                style={showGrid ? undefined : {opacity: 0.55}}
                            />
                        </Field>
                        <Field label="Robot length (in)">
                            <input type="number" min={1} max={36} step={0.5} value={length} onChange={(event) => setRobotDimensions((prev) => ({...prev, length: event.target.value}))} />
                        </Field>
                        <Field label="Robot width (in)">
                            <input type="number" min={1} max={36} step={0.5} value={width} onChange={(event) => setRobotDimensions((prev) => ({...prev, width: event.target.value}))} />
                        </Field>
                    </div>
                    <p className="helper-text">Length aligns with +X, width with +Y.</p>
                </>
            )}
        </section>
    );
    
    const renderTagsSection = () => (
        <section key="tags" {...getDragProps("tags")}>
            <div className="drag-handle" title="Drag to reorder">⋮⋮</div>
            <div
                className="card-header collapsible"
                role="button"
                tabIndex={0}
                aria-expanded={openSections.tags}
                aria-controls="tags-card"
                onClick={() => toggleSection("tags")}
                onKeyDown={(event) => handleToggleKey(event, "tags")}
            >
                <div>
                    <h3>Tags</h3>
                    <p>Attach metadata to match automation routines.</p>
                </div>
                <span className="collapse-caret">{openSections.tags ? "▾" : "▸"}</span>
            </div>
            {openSections.tags && (
                <div id="tags-card">
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
                                                        {pointTags.map((tag) => (
                                                            <div key={tag.originalIndex} className="point-tag-item">
                                                                <div className="point-tag-header">
                                                                    <div style={{flex: 1, minWidth: 0}}>
                                                                        <span className="point-tag-name">{tag.name}</span>
                                                                        <div className="point-tag-value">{tag.value}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="point-tag-actions">
                                                                    <button
                                                                        className="btn ghost"
                                                                        onClick={() => {
                                                                            const newName = prompt("Tag name:", tag.name);
                                                                            const newValue = prompt("Tag value:", tag.value);
                                                                            if (newName && onEditTag) {
                                                                                onEditTag(tag.originalIndex, newName, Number(newValue) || 0, tag.index);
                                                                            }
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
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="helper-text">No tags for this point</p>
                                                )}

                                                <div className="field-grid">
                                                    <Field label="Tag Type">
                                                        <select 
                                                            value={tagName} 
                                                            onChange={(event) => {
                                                                const selectedName = event.target.value;
                                                                setTagName(selectedName);
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
                                                                    setTagValue(defaults[selectedName]);
                                                                }
                                                            }}
                                                        >
                                                            <option value="">-- Select Type --</option>
                                                            <option value="velocity">velocity - Robot speed (in/s)</option>
                                                            <option value="pause">pause - Pause duration (sec)</option>
                                                            <option value="intake">intake - Intake control</option>
                                                            <option value="autoAimRed">autoAimRed - Red alliance aim</option>
                                                            <option value="autoAimBlue">autoAimBlue - Blue alliance aim</option>
                                                            <option value="shooterVelocity">shooterVelocity - Shooter speed</option>
                                                            <option value="hoodAngle">hoodAngle - Hood angle (deg)</option>
                                                            <option value="launchArtifacts">launchArtifacts - Launch duration (sec)</option>
                                                        </select>
                                                    </Field>
                                                    <Field label="Value">
                                                        <input 
                                                            type="number" 
                                                            step={0.1} 
                                                            placeholder="0" 
                                                            value={tagValue} 
                                                            onChange={(event) => setTagValue(event.target.value)} 
                                                        />
                                                    </Field>
                                                </div>
                                                <button 
                                                    className="btn primary" 
                                                    onClick={() => {
                                                        if (tagName.trim()) {
                                                            setTagPointIndex(pointIndex + 1);
                                                            addTag();
                                                        }
                                                    }} 
                                                    disabled={!tagName.trim()}
                                                    style={{width: '100%'}}
                                                >
                                                    Add Tag to Point {pointIndex + 1}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </>
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
        overlay: renderOverlaySection,
        tags: renderTagsSection,
    };

    return (
        <aside className="panel panel-build">
            <div className="panel-header">
                <h2>Planner Controls</h2>
                <button className="btn ghost small" onClick={onOpenSettings} title="Open Settings">
                    ⚙️ Setup
                </button>
            </div>
            <div className="panel-body scroll-area">
                {sectionOrder.map(sectionId => sectionRenderers[sectionId]?.())}
            </div>
        </aside>
    );
}

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
