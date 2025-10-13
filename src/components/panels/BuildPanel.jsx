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
                                       addTag,
                                       pointsLength,
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

    const toggleSection = (key) => {
        setOpenSections((prev) => ({...prev, [key]: !prev[key]}));
    };

    const handleToggleKey = (event, key) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleSection(key);
        }
    };

    return (
        <aside className="panel panel-build">
            <div className="panel-header">
                <h2>Planner Controls</h2>
            </div>
            <div className="panel-body scroll-area">
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
                            <h3>Motion &amp; Placement</h3>
                            <p>Match drivetrain performance and snapping preferences.</p>
                        </div>
                        <span className="collapse-caret">{openSections.motion ? "▾" : "▸"}</span>
                    </div>
                    {openSections.motion && (
                        <div className="field-grid" id="motion-card">
                            <Field label="Velocity (in/s)">
                                <input type="number" min={1} max={200} step={1} value={velocity} onChange={(event) => setVelocity(Number(event.target.value))} />
                            </Field>
                            <Field label="Max accel (in/s²)">
                                <input type="number" min={1} max={400} step={1} value={maxAccel} onChange={(event) => setMaxAccel(Number(event.target.value))} />
                            </Field>
                            <Field label="Preview speed (in/s)">
                                <input type="number" min={1} max={200} step={1} value={playSpeed} onChange={(event) => setPlaySpeed(Number(event.target.value))} />
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
                                    <input type="number" min={1} max={36} step={0.5} value={length} onChange={(event) => setRobotDimensions((prev) => ({...prev, length: Number(event.target.value)}))} />
                                </Field>
                                <Field label="Robot width (in)">
                                    <input type="number" min={1} max={36} step={0.5} value={width} onChange={(event) => setRobotDimensions((prev) => ({...prev, width: Number(event.target.value)}))} />
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
                        <>
                            <div className="field-grid" id="tags-card">
                                <Field label="Name">
                                    <input type="text" placeholder="e.g., intakeOn" value={tagName} onChange={(event) => setTagName(event.target.value)} />
                                </Field>
                                <Field label="Value">
                                    <input type="number" step={1} placeholder="0" value={tagValue} onChange={(event) => setTagValue(event.target.value)} />
                                </Field>
                            </div>
                            <div className="card-actions">
                                <button className="btn pill" onClick={addTag} disabled={pointsLength === 0 || !tagName.trim()}>
                                    Add tag to latest point
                                </button>
                            </div>
                        </>
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
