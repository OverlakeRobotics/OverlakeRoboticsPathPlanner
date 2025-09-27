export default function BuildPanel({
    onUploadBackground,
    onResetBackground,
    canvasSize,
    setCanvasSize,
    canvasOptions,
    shapeType,
    setShapeType,
    headingMode,
    setHeadingMode,
    endHeading,
    setEndHeading,
    velocity,
    setVelocity,
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
    return (
        <aside className="panel">
            <div className="panel-header">Build Path</div>
            <div className="panel-body scroll-area">
                <section className="section">
                    <h3>Field Background</h3>
                    <input type="file" accept="image/*" onChange={onUploadBackground} />
                    <div className="inline">
                        <button className="btn ghost" onClick={onResetBackground}>Default field</button>
                        <select value={canvasSize} onChange={(event) => setCanvasSize(Number(event.target.value))}>
                            {canvasOptions.map((option) => (
                                <option key={option} value={option}>{`Canvas ${option}`}</option>
                            ))}
                        </select>
                    </div>
                </section>

                <section className="section">
                    <h3>Segment Type</h3>
                    <div className="grid-three">
                        <button className={`btn ${shapeType === "line" ? "primary" : ""}`} onClick={() => setShapeType("line")}>
                            Line
                        </button>
                        <button className={`btn ${shapeType === "bezier" ? "primary" : ""}`} onClick={() => setShapeType("bezier")}>
                            Bezier
                        </button>
                        <button className={`btn ${shapeType === "arc" ? "primary" : ""}`} onClick={() => setShapeType("arc")}>
                            Arc
                        </button>
                    </div>
                </section>

                <section className="section">
                    <h3>Heading Mode</h3>
                    <div className="grid-two">
                        <button className={`btn ${headingMode === "straight" ? "primary" : ""}`} onClick={() => setHeadingMode("straight")}>
                            Straight + End Heading
                        </button>
                        <button className={`btn ${headingMode === "tangent" ? "primary" : ""}`} onClick={() => setHeadingMode("tangent")}>
                            Tangent (forward)
                        </button>
                    </div>
                    <div className="grid-two">
                        <button className={`btn ${headingMode === "orth-left" ? "primary" : ""}`} onClick={() => setHeadingMode("orth-left")}>
                            Orthogonal (left)
                        </button>
                        <button className={`btn ${headingMode === "orth-right" ? "primary" : ""}`} onClick={() => setHeadingMode("orth-right")}>
                            Orthogonal (right)
                        </button>
                    </div>
                    {headingMode === "straight" && (
                        <div>
                            <label className="small">Desired end heading (°)</label>
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
                </section>

                <section className="section">
                    <h3>Motion</h3>
                    <div className="grid-two">
                        <div>
                            <label className="small">Velocity (in/s)</label>
                            <input
                                type="number"
                                min={1}
                                max={120}
                                step={1}
                                value={velocity}
                                onChange={(event) => setVelocity(Number(event.target.value))}
                            />
                        </div>
                        <div>
                            <label className="small">Preview speed (in/s)</label>
                            <input
                                type="number"
                                min={1}
                                max={120}
                                step={1}
                                value={playSpeed}
                                onChange={(event) => setPlaySpeed(Number(event.target.value))}
                            />
                        </div>
                    </div>
                    <div className="grid-two">
                        <div>
                            <label className="small">Tolerance (in)</label>
                            <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={tolerance}
                                onChange={(event) => setTolerance(event.target.value)}
                            />
                        </div>
                        <div>
                            <label className="small">Snap (in) – placement only</label>
                            <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={snapInches}
                                onChange={(event) => setSnapInches(event.target.value)}
                            />
                        </div>
                    </div>
                </section>

                <section className="section">
                    <h3>Start Pose</h3>
                    <div className="grid-three">
                        <label>
                            <span className="small">X (in)</span>
                            <input type="text" value={String(startPose.x)} onChange={(event) => handlePoseChange(event.target.value, "x", setStartPose)} />
                        </label>
                        <label>
                            <span className="small">Y (in)</span>
                            <input type="text" value={String(startPose.y)} onChange={(event) => handlePoseChange(event.target.value, "y", setStartPose)} />
                        </label>
                        <label>
                            <span className="small">Heading (°)</span>
                            <input type="text" value={String(startPose.h)} onChange={(event) => handlePoseChange(event.target.value, "h", setStartPose)} />
                        </label>
                    </div>
                    <div className="inline">
                        <button className={`btn ${placeStart ? "primary" : "ok"}`} onClick={togglePlaceStart}>
                            {placeStart ? "Select on field…" : "Click to place start"}
                        </button>
                        <button className="btn ghost" onClick={useLivePose} disabled={!livePoseAvailable}>
                            Use live robot pose
                        </button>
                    </div>
                </section>

                <section className="section">
                    <h3>Grid &amp; Robot</h3>
                    <div className="grid-two">
                        <div>
                            <label className="small">Grid overlay</label>
                            <select value={showGrid ? "on" : "off"} onChange={(event) => setShowGrid(event.target.value === "on")}>
                                <option value="off">Off</option>
                                <option value="on">On</option>
                            </select>
                        </div>
                        <div>
                            <label className="small">Grid step (in)</label>
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
                        </div>
                    </div>
                    <div className="grid-two">
                        <div>
                            <label className="small">Robot length (in)</label>
                            <input type="number" min={1} max={36} step={0.5} value={length} onChange={(event) => setRobotDimensions((prev) => ({...prev, length: Number(event.target.value)}))} />
                        </div>
                        <div>
                            <label className="small">Robot width (in)</label>
                            <input type="number" min={1} max={36} step={0.5} value={width} onChange={(event) => setRobotDimensions((prev) => ({...prev, width: Number(event.target.value)}))} />
                        </div>
                    </div>
                    <span className="small">Length aligns with +X, width with +Y.</span>
                </section>

                <section className="section">
                    <h3>Tags</h3>
                    <div className="grid-two">
                        <input
                            type="text"
                            placeholder="Name (e.g., intakeOn)"
                            value={tagName}
                            onChange={(event) => setTagName(event.target.value)}
                        />
                        <input
                            type="number"
                            step={1}
                            placeholder="Value"
                            value={tagValue}
                            onChange={(event) => setTagValue(event.target.value)}
                        />
                    </div>
                    <div className="inline">
                        <button className="btn ok" onClick={addTag} disabled={pointsLength === 0 || !tagName.trim()}>
                            Add Tag
                        </button>
                        <span className="small">Tags attach to the most recent point.</span>
                    </div>
                </section>
            </div>
        </aside>
    );
}

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
