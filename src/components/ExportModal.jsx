import { useState } from "react";

export default function ExportModal({ isOpen, onClose, onExport }) {
  const [fileName, setFileName] = useState(`ftc_path_${Date.now()}`);

  if (!isOpen) return null;

  const handleExport = () => {
    const cleanedName = (fileName.trim() || `ftc_path_${Date.now()}`).replace(/\.json$/i, '');
    onExport(cleanedName);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleExport();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Export Path</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>Filename (without .json extension)</label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ftc_path"
              autoFocus
            />
          </div>
          <p className="helper-text">
            The file will be saved as <strong>{fileName.trim() || 'ftc_path'}.json</strong>
          </p>
        </div>

        <div className="modal-footer">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={handleExport}
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
