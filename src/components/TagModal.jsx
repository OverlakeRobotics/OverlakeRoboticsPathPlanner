import { useState } from "react";

const TAG_TEMPLATES = [
  { name: "velocity", defaultValue: 50, unit: "in/s" },
  { name: "pause", defaultValue: 1, unit: "seconds" },
  { name: "intake", defaultValue: 0, unit: "velocity" },
  { name: "autoAimRed", defaultValue: 0, unit: "" },
  { name: "autoAimBlue", defaultValue: 0, unit: "" },
  { name: "shooterVelocity", defaultValue: 0, unit: "velocity" },
  { name: "hoodAngle", defaultValue: 0, unit: "degrees" },
  { name: "launchArtifacts", defaultValue: 1, unit: "seconds" },
];

export default function TagModal({ isOpen, onClose, onAddTag, pointIndex, pointsCount }) {
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [tagValue, setTagValue] = useState(0);
  const [addedTags, setAddedTags] = useState([]);

  if (!isOpen) return null;

  const handleTemplateChange = (templateName) => {
    setSelectedTemplate(templateName);
    const template = TAG_TEMPLATES.find(t => t.name === templateName);
    if (template) {
      setTagValue(template.defaultValue);
    }
  };

  const handleAddAnother = () => {
    if (selectedTemplate) {
      onAddTag(selectedTemplate, tagValue, pointIndex);
      setAddedTags(prev => [...prev, { name: selectedTemplate, value: tagValue }]);
      setSelectedTemplate("");
      setTagValue(0);
    }
  };

  const handleDone = () => {
    if (selectedTemplate) {
      onAddTag(selectedTemplate, tagValue, pointIndex);
    }
    setSelectedTemplate("");
    setTagValue(0);
    setAddedTags([]);
    onClose();
  };

  const handleSkip = () => {
    setSelectedTemplate("");
    setTagValue(0);
    setAddedTags([]);
    onClose();
  };

  const selectedTemplateData = TAG_TEMPLATES.find(t => t.name === selectedTemplate);

  return (
    <div className="modal-overlay" onClick={handleSkip}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Tag to Point {pointIndex}</h3>
          <button className="modal-close" onClick={handleSkip} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {addedTags.length > 0 && (
            <div className="added-tags-list">
              <strong>Tags added to point {pointIndex}:</strong>
              {addedTags.map((tag, idx) => (
                <div key={idx} className="added-tag-item">
                  {tag.name} = {tag.value}
                </div>
              ))}
            </div>
          )}

          <div className="field-grid">
            <div className="field">
              <label>Tag</label>
              <select
                value={selectedTemplate}
                onChange={(e) => handleTemplateChange(e.target.value)}
                autoFocus
              >
                <option value="">-- Select --</option>
                {TAG_TEMPLATES.map((template) => (
                  <option key={template.name} value={template.name}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>
                Value
                {selectedTemplateData?.unit && <span className="field-hint"> ({selectedTemplateData.unit})</span>}
              </label>
              <input
                type="number"
                value={tagValue}
                onChange={(e) => setTagValue(Number(e.target.value))}
                disabled={!selectedTemplate}
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn ghost" onClick={handleSkip}>
            {addedTags.length > 0 ? "Done" : "Skip"}
          </button>
          {selectedTemplate && (
            <button
              className="btn ghost"
              onClick={handleAddAnother}
            >
              Add & Continue
            </button>
          )}
          <button
            className="btn primary"
            onClick={handleDone}
            disabled={!selectedTemplate && addedTags.length === 0}
          >
            {selectedTemplate ? "Add & Done" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
