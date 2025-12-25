import { useState, useEffect } from "react";
import {
    FIELD_SIZE_IN,
    GRID_DEFAULT_STEP,
    DEFAULT_ROBOT_DIMENSIONS,
    PATH_COLOR,
    START_COLOR,
    WAYPOINT_COLOR,
    FOOTPRINT_FILL,
    LIVE_POSE_FILL,
    PREVIEW_FILL
} from "../constants/config";
import { THEME_PRESETS } from "../constants/themes";
import ThemePresetCard from "./ThemePresetCard";

const DEFAULT_PALETTE = {
    path: PATH_COLOR,
    start: START_COLOR,
    waypoint: WAYPOINT_COLOR,
    footprint: FOOTPRINT_FILL,
    livePose: LIVE_POSE_FILL,
    preview: PREVIEW_FILL
};

export default function SetupModal({ isOpen, onClose, onSave, initialSettings }) {
    const [activeTab, setActiveTab] = useState("general");
    
    // General Settings
    const [fieldSize, setFieldSize] = useState(FIELD_SIZE_IN);
    const [showGrid, setShowGrid] = useState(true);
    const [gridStepEntry, setGridStepEntry] = useState(String(GRID_DEFAULT_STEP));
    const [robotDimensions, setRobotDimensions] = useState({...DEFAULT_ROBOT_DIMENSIONS});
    
    // Theme Settings
    const [palette, setPalette] = useState(DEFAULT_PALETTE);
    const [themeName, setThemeName] = useState("default");
    
    // Effects Settings
    const [blurStrength, setBlurStrength] = useState(16);
    const [panelOpacity, setPanelOpacity] = useState(0.85);
    const [cardOpacity, setCardOpacity] = useState(0.6);
    const [uiScale, setUiScale] = useState(0.8);

    useEffect(() => {
        if (isOpen && initialSettings) {
            setFieldSize(initialSettings.fieldSize || FIELD_SIZE_IN);
            setShowGrid(Boolean(initialSettings.showGrid));
            const step = Number(initialSettings.gridStep);
            const nextStep = Number.isFinite(step) && step > 0 ? step : GRID_DEFAULT_STEP;
            setGridStepEntry(initialSettings.gridStepEntry ?? String(nextStep));
            setRobotDimensions(initialSettings.robotDimensions || {...DEFAULT_ROBOT_DIMENSIONS});
            setPalette(initialSettings.palette || DEFAULT_PALETTE);
            
            setThemeName(initialSettings.themeName || "default");
            setBlurStrength(initialSettings.blurStrength ?? 16);
            setPanelOpacity(initialSettings.panelOpacity ?? 0.85);
            setCardOpacity(initialSettings.cardOpacity ?? 0.6);
            setUiScale(initialSettings.uiScale ?? 0.8);
        }
    }, [isOpen, initialSettings]);

    const commitGridStep = () => {
        const parsed = parseFloat(gridStepEntry);
        if (!gridStepEntry || !Number.isFinite(parsed) || parsed <= 0) {
            setGridStepEntry(String(GRID_DEFAULT_STEP));
        } else {
            setGridStepEntry(String(parsed));
        }
    };

    const handleSave = () => {
        const parsed = parseFloat(gridStepEntry);
        const resolvedStep = (!gridStepEntry || !Number.isFinite(parsed) || parsed <= 0)
            ? GRID_DEFAULT_STEP
            : parsed;
        onSave({ 
            fieldSize, 
            showGrid,
            gridStep: resolvedStep,
            gridStepEntry: String(resolvedStep),
            robotDimensions,
            palette,
            themeName,
            blurStrength,
            panelOpacity,
            cardOpacity,
            uiScale
        });
        onClose();
    };

    const handleReset = () => {
        setFieldSize(FIELD_SIZE_IN);
        setShowGrid(true);
        setGridStepEntry(String(GRID_DEFAULT_STEP));
        setRobotDimensions({...DEFAULT_ROBOT_DIMENSIONS});
        setPalette(DEFAULT_PALETTE);
        setThemeName("default");
        setBlurStrength(16);
        setPanelOpacity(0.85);
        setCardOpacity(0.6);
        setUiScale(0.8);
    };

    const handleThemeSelect = (key) => {
        const preset = THEME_PRESETS[key];
        if (preset) {
            setThemeName(key);
            // Extract only the palette-relevant colors from the preset
            const newPalette = {
                path: preset.colors.path,
                start: preset.colors.start,
                waypoint: preset.colors.waypoint,
                footprint: preset.colors.footprint,
                livePose: preset.colors.livePose,
                preview: preset.colors.preview
            };
            setPalette(newPalette);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content setup-modal">
                <div className="modal-header">
                    <h3>Planner Configuration</h3>
                </div>
                
                <div className="button-group compact" style={{ padding: '0 28px', marginTop: '16px' }}>
                    <button 
                        className={`btn pill ${activeTab === 'general' ? 'pill-active' : ''}`}
                        onClick={() => setActiveTab('general')}
                    >
                        General
                    </button>
                    <button 
                        className={`btn pill ${activeTab === 'theme' ? 'pill-active' : ''}`}
                        onClick={() => setActiveTab('theme')}
                    >
                        Theme & Colors
                    </button>
                    <button 
                        className={`btn pill ${activeTab === 'effects' ? 'pill-active' : ''}`}
                        onClick={() => setActiveTab('effects')}
                    >
                        UI Effects
                    </button>
                </div>

                <div className="modal-body">
                    {activeTab === 'general' && (
                        <>
                            <p className="helper-text" style={{ marginTop: 0 }}>
                                Customize the environment settings for your specific field and robot configuration.
                            </p>

                            <div className="modal-section">
                                <h3>Field Geometry</h3>
                                <div className="field">
                                    <label>Field Size (inches)</label>
                                    <input
                                        type="number"
                                        value={fieldSize}
                                        onChange={(e) => setFieldSize(Number(e.target.value))}
                                    />
                                    <span className="field-hint">Total width/height of the square field.</span>
                                </div>
                            </div>

                            <div className="modal-section">
                                <h3>Field Overlay</h3>
                                <div className="field-grid">
                                    <div className="field">
                                        <label>Grid overlay</label>
                                        <select value={showGrid ? "on" : "off"} onChange={(event) => setShowGrid(event.target.value === "on")}>
                                            <option value="off">Hidden</option>
                                            <option value="on">Visible</option>
                                        </select>
                                    </div>
                                    <div className="field">
                                        <label>Grid step (in)</label>
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
                                <div className="field-grid" style={{marginTop: "12px"}}>
                                    <div className="field">
                                        <label>Robot length (in)</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={36}
                                            step={0.5}
                                            value={robotDimensions.length}
                                            onChange={(event) => setRobotDimensions((prev) => ({...prev, length: event.target.value}))}
                                        />
                                    </div>
                                    <div className="field">
                                        <label>Robot width (in)</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={36}
                                            step={0.5}
                                            value={robotDimensions.width}
                                            onChange={(event) => setRobotDimensions((prev) => ({...prev, width: event.target.value}))}
                                        />
                                    </div>
                                </div>
                                <p className="helper-text">Length aligns with +X, width with +Y.</p>
                            </div>
                        </>
                    )}

                    {activeTab === 'theme' && (
                        <>
                            <div className="modal-section">
                                <h3>Theme Presets</h3>
                                <div className="theme-preset-grid">
                                    {Object.entries(THEME_PRESETS).map(([key, theme]) => (
                                        <ThemePresetCard 
                                            key={key}
                                            theme={theme}
                                            isActive={themeName === key}
                                            onClick={() => handleThemeSelect(key)}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="modal-section">
                                <h3>Custom Palette</h3>
                                <div className="color-grid">
                                    <ColorField label="Path Line" color={palette.path} onChange={(c) => setPalette({ ...palette, path: c })} />
                                    <ColorField label="Start Point" color={palette.start} onChange={(c) => setPalette({ ...palette, start: c })} />
                                    <ColorField label="Waypoints" color={palette.waypoint} onChange={(c) => setPalette({ ...palette, waypoint: c })} />
                                    <ColorField label="Robot Body" color={palette.footprint} onChange={(c) => setPalette({ ...palette, footprint: c })} />
                                    <ColorField label="Live Pose" color={palette.livePose} onChange={(c) => setPalette({ ...palette, livePose: c })} />
                                    <ColorField label="Ghost Preview" color={palette.preview} onChange={(c) => setPalette({ ...palette, preview: c })} />
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === 'effects' && (
                        <>
                            <div className="modal-section">
                                <h3>Glassmorphism Effects</h3>
                                <SliderField 
                                    label="Blur Strength" 
                                    value={blurStrength} 
                                    min={0} max={32} step={1} 
                                    suffix="px"
                                    onChange={setBlurStrength} 
                                />
                                <SliderField 
                                    label="Panel Opacity" 
                                    value={panelOpacity} 
                                    min={0.3} max={1} step={0.05} 
                                    onChange={setPanelOpacity} 
                                />
                                <SliderField 
                                    label="Card Opacity" 
                                    value={cardOpacity} 
                                    min={0.1} max={1} step={0.05} 
                                    onChange={setCardOpacity} 
                                />
                            </div>

                            <div className="modal-section">
                                <h3>Interface Scale</h3>
                                <SliderField 
                                    label="UI Scale Factor" 
                                    value={uiScale} 
                                    min={0.5} max={1.2} step={0.05} 
                                    onChange={setUiScale} 
                                />
                            </div>
                        </>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn ghost" onClick={handleReset}>Reset Defaults</button>
                    <button className="btn primary" onClick={handleSave}>Apply Settings</button>
                </div>
            </div>
        </div>
    );
}

const ColorField = ({ label, color, onChange }) => (
    <div className="field color-field">
        <label>{label}</label>
        <div className="color-input-wrapper">
            <input
                type="color"
                value={color}
                onChange={(e) => onChange(e.target.value)}
            />
            <span className="color-value">{color}</span>
        </div>
    </div>
);

const SliderField = ({ label, value, min, max, step, suffix = "", onChange }) => (
    <div className="slider-field">
        <div className="slider-header">
            <label>{label}</label>
            <span className="slider-value">{typeof value === 'number' ? Math.round(value * 100) / 100 : value}{suffix}</span>
        </div>
        <input 
            type="range" 
            min={min} 
            max={max} 
            step={step} 
            value={value} 
            onChange={(e) => onChange(Number(e.target.value))} 
        />
    </div>
);
