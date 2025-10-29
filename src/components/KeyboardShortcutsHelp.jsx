import React, {useEffect, useState} from 'react';
import { formatKeyCombo } from '../hooks/useKeyboardShortcuts';
import './KeyboardShortcutsHelp.css';
import './Settings.css';
import { DEFAULT_KEYBINDS, KEYBIND_LABELS } from '../constants/keybinds';

/**
 * Modal overlay displaying all available keyboard shortcuts
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the help modal is open
 * @param {Function} props.onClose - Callback to close the modal
 * @param {boolean} props.isMac - Whether the platform is Mac
 */
export const KeyboardShortcutsHelp = ({ isOpen, onClose, isMac, keybinds, onKeybindsChange, scrollSensitivity, onScrollSensitivityChange, defaultShowSettings = false }) => {
  const [showSettings, setShowSettings] = useState(Boolean(defaultShowSettings));
  const [editingKeybinds, setEditingKeybinds] = useState(keybinds || {});
  const [capturingKey, setCapturingKey] = useState(null);
  const [localScrollSensitivity, setLocalScrollSensitivity] = useState(scrollSensitivity ?? 5);

  useEffect(() => {
    setEditingKeybinds(keybinds || {});
  }, [keybinds]);

  useEffect(() => {
    setLocalScrollSensitivity(scrollSensitivity ?? 5);
  }, [scrollSensitivity]);

  if (!isOpen) return null;

  const shortcuts = {
    'Drawing Tools': [
      { keys: 'L', description: 'Switch to Line mode' },
      { keys: 'B', description: 'Switch to Bézier mode' },
      { keys: 'A', description: 'Switch to Arc mode' },
      { keys: 'D', description: 'Switch to Draw mode' },
    ],
    'Actions': [
      { keys: 'S', description: 'Toggle start placement mode' },
      { keys: 'Space', description: 'Toggle playback (play/pause)' },
      { keys: 'Delete', description: 'Remove last point' },
      { keys: 'Backspace', description: 'Remove last point' },
      { keys: 'Escape', description: 'Cancel current operation (also cancels inline point editor)' },
      { keys: 'Enter', description: 'Confirm / save changes in inline point editor' },
      { keys: 'Tab', description: 'Accept tag autocomplete suggestion while editing tags' },
      { keys: 'ctrl+z', description: 'Undo last action' },
      { keys: 'ctrl+shift+z', description: 'Redo last action' },
      { keys: 'ctrl+y', description: 'Redo last action (alternative)' },
    ],
    'View': [
      { keys: 'G', description: 'Toggle grid visibility' },
    ],
    'Help': [
      { keys: 'H', description: 'Show this help dialog' },
      { keys: 'F1', description: 'Show this help dialog' },
    ],
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (showSettings) setShowSettings(false);
      else onClose();
    }
  };

  // Use shared defaults from constants
  // KEYBIND_LABELS imported from constants

  const handleSaveSettings = () => {
    if (typeof onKeybindsChange === 'function') onKeybindsChange(editingKeybinds);
    if (typeof onScrollSensitivityChange === 'function') onScrollSensitivityChange(localScrollSensitivity);
    try { localStorage.setItem('keybinds', JSON.stringify(editingKeybinds)); } catch (e) {}
    try { localStorage.setItem('scrollSensitivity', String(localScrollSensitivity)); } catch (e) {}
    setShowSettings(false);
  };

  const handleResetSettings = () => {
    setEditingKeybinds(DEFAULT_KEYBINDS);
    setLocalScrollSensitivity(5);
  };

  const handleKeyCapture = (event, action) => {
    event.preventDefault();
    const modifiers = [];
    if (event.ctrlKey || event.metaKey) modifiers.push('ctrl');
    if (event.shiftKey) modifiers.push('shift');
    if (event.altKey) modifiers.push('alt');
    let key = event.key.toLowerCase();
    if (key === ' ') key = ' ';
    else if (key === 'escape') { setCapturingKey(null); return; }
    const keyString = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key;
    setEditingKeybinds(prev => ({ ...prev, [action]: keyString }));
    setCapturingKey(null);
  };

  return (
    <div 
      className="keyboard-shortcuts-overlay"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div className="keyboard-shortcuts-modal">
        <div className="keyboard-shortcuts-header">
          <h2 id="shortcuts-title">Help & Settings</h2>
          <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
            <button className={`tab-button ${!showSettings ? 'active' : ''}`} onClick={() => setShowSettings(false)}>Shortcuts</button>
            <button className={`tab-button ${showSettings ? 'active' : ''}`} onClick={() => setShowSettings(true)}>Settings</button>
            <button
              className="close-button"
              onClick={onClose}
              aria-label="Close help dialog"
            >
              ×
            </button>
          </div>
        </div>

        <div className="keyboard-shortcuts-content">
          {!showSettings && (
            <> 
              {Object.entries(shortcuts).map(([category, items]) => (
                <div key={category} className="shortcuts-category">
                  <h3>{category}</h3>
                  <div className="shortcuts-list">
                    {items.map((shortcut, index) => (
                      <div key={index} className="shortcut-item">
                        <kbd className="shortcut-keys">
                          {formatKeyCombo(shortcut.keys, isMac)}
                        </kbd>
                        <span className="shortcut-description">
                          {shortcut.description}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          {showSettings && (
            <div className="settings-embedded">
              <h3>Keyboard Shortcuts</h3>
              <p className="settings-hint">Click a keybind to change it</p>
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
                      {capturingKey === action ? 'Press a key...' : (editingKeybinds[action] || 'None')}
                    </button>
                  </div>
                ))}
              </div>

              <h3 style={{marginTop: 12}}>Mouse Settings</h3>
              <div className="setting-row">
                <label htmlFor="scroll-sensitivity">Scroll wheel sensitivity <span className="setting-hint">(degrees per tick)</span></label>
                <input id="scroll-sensitivity" type="range" min="1" max="15" step="1" value={localScrollSensitivity} onChange={(e) => setLocalScrollSensitivity(Number(e.target.value))} />
                <span className="sensitivity-value">{localScrollSensitivity}°</span>
              </div>

              <div className="settings-footer-embedded">
                <button className="settings-button reset-button" onClick={handleResetSettings}>Reset to Defaults</button>
                <div className="settings-actions">
                  <button className="settings-button cancel-button" onClick={() => setShowSettings(false)}>Cancel</button>
                  <button className="settings-button save-button" onClick={handleSaveSettings}>Save</button>
                </div>
              </div>
            </div>
          )}

        </div>

        <div className="keyboard-shortcuts-footer">
          <p>While editing a point inline: press <kbd>Enter</kbd> to save, <kbd>Escape</kbd> to cancel. Use <kbd>Tab</kbd> or <kbd>Enter</kbd> to accept tag suggestions while typing. Click outside or press <kbd>Escape</kbd> to close this dialog.</p>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsHelp;