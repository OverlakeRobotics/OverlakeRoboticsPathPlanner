import {useState} from "react";
import PointEditorPopover from "../PointEditorPopover";
 
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
                                       editorOpen, // disables per-point controls when inline editor is active
                                       points, // array of waypoints
                                       setPoints, // for reordering
                                       onPointSelect, // callback to jump to point on canvas
                                       selectedPointIndex, // currently selected point
                                   }) {
    const {length, width} = robotDimensions;
    const [openSections, setOpenSections] = useState({
        segment: true,
        heading: true,
        start: true,
        points: true, // New section for point list
        motion: false,
        overlay: false,
        tags: false,
    });
    const [pointEditor, setPointEditor] = useState({open: false, index: null, position: null});

    const updatePoint = (index, patch) => {
        if (typeof setPoints === "function") {
            setPoints((prev) => {
                const next = [...prev];
                next[index] = { ...(next[index] ?? {}), ...patch };
                return next;
            });
        }
    };

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
                            <SegmentButton
                                label="Line"
                                icon="━"
                                shortcut="L"
                                active={shapeType === "line"}
                                onClick={() => setShapeType("line")}
                            />
                            <SegmentButton
                                label="Draw"
                                icon="✏"
                                shortcut="D"
                                active={shapeType === "draw"}
                                onClick={() => setShapeType("draw")}
                            />
                            <SegmentButton
                                label="Bézier"
                                icon="∿"
                                shortcut="B"
                                active={shapeType === "bezier"}
                                onClick={() => setShapeType("bezier")}
                            />
                            <SegmentButton
                                label="Arc"
                                icon="⌢"
                                shortcut="A"
                                active={shapeType === "arc"}
                                onClick={() => setShapeType("arc")}
                            />
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
                            <SegmentButton label="Tangent" active={headingMode === "tangent"} onClick={() => setHeadingMode("tangent")} />
                            <SegmentButton label="Straight" active={headingMode === "straight"} onClick={() => setHeadingMode("straight")} />
                            <SegmentButton label="Manual" active={headingMode === "manual"} onClick={() => setHeadingMode("manual")} />
                            <SegmentButton label="Orthogonal L" active={headingMode === "orth-left"} onClick={() => setHeadingMode("orth-left")} />
                            <SegmentButton label="Orthogonal R" active={headingMode === "orth-right"} onClick={() => setHeadingMode("orth-right")} />
                            {headingMode === "straight" && (
                                <div className="field">
                                    <label>Desired end heading</label>
                                    <div style={{position: 'relative'}}>
                                        <input
                                            type="number"
                                            step="1"
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
                                            style={{paddingRight: '28px'}}
                                        />
                                        <span style={{
                                            position: 'absolute',
                                            right: '8px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            color: 'var(--text-secondary)',
                                            fontSize: '0.875rem',
                                            pointerEvents: 'none'
                                        }}>°</span>
                                    </div>
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
                        <div id="start-card" style={{padding: 'var(--spacing-sm) 0'}}>
                            <div className="field-grid three">
                                <Field label="X" unit="in">
                                    <input
                                        type="number"
                                        step="0.5"
                                        value={String(startPose.x)}
                                        onChange={(event) => handlePoseChange(event.target.value, "x", setStartPose)}
                                    />
                                </Field>
                                <Field label="Y" unit="in">
                                    <input
                                        type="number"
                                        step="0.5"
                                        value={String(startPose.y)}
                                        onChange={(event) => handlePoseChange(event.target.value, "y", setStartPose)}
                                    />
                                </Field>
                                <Field label="Heading" unit="°">
                                    <input
                                        type="number"
                                        step="1"
                                        value={String(startPose.h)}
                                        onChange={(event) => handlePoseChange(event.target.value, "h", setStartPose)}
                                    />
                                </Field>
                            </div>
                            <div className="card-actions" style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 'var(--spacing-sm)',
                                marginTop: 'var(--spacing-md)',
                                paddingTop: 'var(--spacing-md)',
                                borderTop: '1px solid var(--color-border-secondary, hsl(210 14% 23%))'
                            }}>
                                <button
                                    className={`btn callout ${placeStart ? "callout-active" : ""}`}
                                    onClick={togglePlaceStart}
                                >
                                    {placeStart ? "📍 Click on field to set start" : "Place start on field"}
                                </button>
                                <button
                                    className="btn callout secondary"
                                    onClick={useLivePose}
                                    disabled={!livePoseAvailable}
                                >
                                    Use live robot pose
                                </button>
                            </div>
                        </div>
                    )}
                </section>

                {/* Waypoints list moved to RunPanel (Manage Path dropdown) */}

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
                            <Field label="Velocity" unit="in/s">
                                <input
                                    type="number"
                                    min={1}
                                    max={200}
                                    step={5}
                                    value={velocity}
                                    onChange={(event) => setVelocity(event.target.value)}
                                />
                            </Field>
                            <Field label="Max accel" unit="in/s²">
                                <input
                                    type="number"
                                    min={1}
                                    max={400}
                                    step={10}
                                    value={maxAccel}
                                    onChange={(event) => setMaxAccel(event.target.value)}
                                />
                            </Field>
                            <Field label="Preview speed" unit="in/s">
                                <input
                                    type="number"
                                    min={1}
                                    max={200}
                                    step={5}
                                    value={playSpeed}
                                    onChange={(event) => setPlaySpeed(event.target.value)}
                                />
                            </Field>
                            <Field label="Tolerance" unit="in">
                                <input
                                    type="number"
                                    min={0}
                                    step={0.5}
                                    value={tolerance}
                                    onChange={(event) => setTolerance(event.target.value)}
                                />
                            </Field>
                            <Field label="Snap" unit="in">
                                <input
                                    type="number"
                                    min={0}
                                    step={0.5}
                                    value={snapInches}
                                    onChange={(event) => setSnapInches(event.target.value)}
                                />
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
                                <Field label="Grid step" unit="in">
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
                                        style={{opacity: showGrid ? 1 : 0.4, cursor: showGrid ? 'text' : 'not-allowed'}}
                                    />
                                </Field>
                                <Field label="Robot length" unit="in">
                                    <input
                                        type="number"
                                        min={1}
                                        max={36}
                                        step={0.5}
                                        value={length}
                                        onChange={(event) => setRobotDimensions((prev) => ({...prev, length: event.target.value}))}
                                    />
                                </Field>
                                <Field label="Robot width" unit="in">
                                    <input
                                        type="number"
                                        min={1}
                                        max={36}
                                        step={0.5}
                                        value={width}
                                        onChange={(event) => setRobotDimensions((prev) => ({...prev, width: event.target.value}))}
                                    />
                                </Field>
                            </div>
                            <p className="helper-text">Length aligns with +X, width with +Y.</p>
                        </>
                    )}
                </section>

                {/* Tags section removed per user request */}
            </div>
        </aside>
    );
}

const SegmentButton = ({label, icon, shortcut, active, onClick}) => (
    <button
        className={`btn pill ${active ? "pill-active" : ""}`}
        onClick={onClick}
        aria-label={`${label} tool (shortcut: ${shortcut})`}
        title={`${label} (${shortcut})`}
        style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--spacing-xs)',
            fontSize: '0.9375rem',
            padding: 'var(--spacing-sm) var(--spacing-md)',
            minHeight: '40px'
        }}
    >
        <span style={{fontSize: '1.125rem', lineHeight: 1}}>{icon}</span>
        <span>{label}</span>
        <kbd style={{
            fontSize: '0.75rem',
            opacity: 0.7,
            fontFamily: 'monospace',
            marginLeft: 'var(--spacing-xs)',
            padding: '2px 4px',
            borderRadius: '3px',
            background: 'rgba(0,0,0,0.1)'
        }}>{shortcut}</kbd>
    </button>
);

const Field = ({label, unit, children}) => (
    <div className="field">
        <label>
            {label}
            {unit && <span style={{
                marginLeft: 'var(--spacing-xs)',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem',
                fontWeight: 'normal'
            }}>({unit})</span>}
        </label>
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
