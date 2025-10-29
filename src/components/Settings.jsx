import React, { useState, useEffect } from 'react';
import './Settings.css';
import { DEFAULT_KEYBINDS, KEYBIND_LABELS } from '../constants/keybinds';

export const Settings = ({ isOpen, onClose, keybinds, onKeybindsChange }) => {
    const [editingKeybinds, setEditingKeybinds] = useState(keybinds || DEFAULT_KEYBINDS);
    const [capturingKey, setCapturingKey] = useState(null);
    const [scrollSensitivity, setScrollSensitivity] = useState(5);

    useEffect(() => {
        const savedSensitivity = localStorage.getItem('scrollSensitivity');
        if (savedSensitivity) {
            setScrollSensitivity(Number(savedSensitivity));
        }
    }, []);

    useEffect(() => {
        if (keybinds) {
            setEditingKeybinds(keybinds);
        }
    }, [keybinds]);

    const handleKeyCapture = (event, action) => {
        event.preventDefault();
        
        const modifiers = [];
        if (event.ctrlKey || event.metaKey) modifiers.push('ctrl');
        if (event.shiftKey) modifiers.push('shift');
        if (event.altKey) modifiers.push('alt');

        let key = event.key.toLowerCase();
        
        // Handle special keys
        if (key === ' ') key = ' ';
        else if (key === 'escape') {
            setCapturingKey(null);
            return;
        }

        const keyString = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key;
        
        setEditingKeybinds(prev => ({
            ...prev,
            [action]: keyString
        }));
        setCapturingKey(null);
    };

    const handleSave = () => {
        onKeybindsChange(editingKeybinds);
        localStorage.setItem('keybinds', JSON.stringify(editingKeybinds));
        localStorage.setItem('scrollSensitivity', scrollSensitivity.toString());
        onClose();
    };

    const handleReset = () => {
        setEditingKeybinds(DEFAULT_KEYBINDS);
        setScrollSensitivity(5);
    };

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div 
            className="settings-overlay"
            onClick={handleBackdropClick}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
        >
            <div className="settings-modal">
                <div className="settings-header">
                    <h2 id="settings-title">Settings</h2>
                    <button
                        className="close-button"
                        onClick={onClose}
                        aria-label="Close settings"
                    >
                        ×
                    </button>
                </div>
                
                <div className="settings-content">
                    <div className="settings-section">
                        <h3>Keyboard Shortcuts</h3>
                        <p className="settings-hint">Click on a keybind to change it</p>
                        <div className="keybinds-grid">
                            {Object.entries(KEYBIND_LABELS).map(([action, label]) => (
                                <div key={action} className="keybind-row">
                                    <span className="keybind-label">{label}</span>
                                    <button
                                        className={`keybind-button ${capturingKey === action ? 'capturing' : ''}`}
                                        onClick={() => setCapturingKey(action)}
                                        onKeyDown={(e) => capturingKey === action && handleKeyCapture(e, action)}
                                        aria-label={`Change keybind for ${label}`}
                                    >
                                        {capturingKey === action ? 'Press a key...' : editingKeybinds[action] || 'None'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="settings-section">
                        <h3>Mouse Settings</h3>
                        <div className="setting-row">
                            <label htmlFor="scroll-sensitivity">
                                Scroll wheel sensitivity (heading adjustment)
                                <span className="setting-hint">Degrees per scroll tick</span>
                            </label>
                            <input
                                id="scroll-sensitivity"
                                type="range"
                                min="1"
                                max="15"
                                step="1"
                                value={scrollSensitivity}
                                onChange={(e) => setScrollSensitivity(Number(e.target.value))}
                            />
                            <span className="sensitivity-value">{scrollSensitivity}°</span>
                        </div>
                    </div>
                </div>

                <div className="settings-footer">
                    <button className="settings-button reset-button" onClick={handleReset}>
                        Reset to Defaults
                    </button>
                    <div className="settings-actions">
                        <button className="settings-button cancel-button" onClick={onClose}>
                            Cancel
                        </button>
                        <button className="settings-button save-button" onClick={handleSave}>
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
