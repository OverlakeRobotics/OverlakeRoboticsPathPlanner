import {useState} from "react";

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
                                       selectedPointIndex,
                                       updatePoint,
                                       deletePoint,
                                       points,
                                       tags,
                                       onRemoveTag,
                                       onEditTag,
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

    return (
        <aside className="panel panel-build">
            <div className="panel-header">
                <h2>Planner Controls</h2>
            </div>
            <div className="panel-body scroll-area">
                {/* Edit Mode Section */}
                <section className="control-card">
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
                    {editMode && selectedPointIndex !== null && (
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
                    {editMode && selectedPointIndex === null && pointsLength > 0 && (
                        <p className="helper-text">Click on a point in the canvas to select and edit it.</p>
                    )}
                </section>

                <section className="control-card">
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

                <section className="control-card">
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

                <section className="control-card">
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

                <section className="control-card">
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

                <section className="control-card">
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

                <section className="control-card">
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
