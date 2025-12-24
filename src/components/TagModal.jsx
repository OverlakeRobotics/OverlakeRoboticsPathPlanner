import { useEffect, useState } from "react";
import { TAG_TEMPLATES } from "../constants/config";

export default function TagModal({ isOpen, onClose, onAddTag, pointIndex, pointsCount, globalVars = [] }) {
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [tagValue, setTagValue] = useState(0);
  const [valueSource, setValueSource] = useState("manual");
  const [selectedGlobal, setSelectedGlobal] = useState("");
  const [addedTags, setAddedTags] = useState([]);

  if (!isOpen) return null;

  const handleTemplateChange = (templateName) => {
    setSelectedTemplate(templateName);
    const template = TAG_TEMPLATES.find(t => t.name === templateName);
    if (template) {
      setTagValue(template.defaultValue);
    }
  };

  useEffect(() => {
    if (valueSource !== "global") return;
    const match = globalVars?.find((entry) => entry.name === selectedGlobal);
    if (match) setTagValue(Number(match.value) || 0);
  }, [valueSource, selectedGlobal, globalVars]);

  const handleAddAnother = () => {
    if (selectedTemplate && (valueSource !== "global" || selectedGlobal)) {
      onAddTag(selectedTemplate, tagValue, pointIndex, valueSource === "global" ? selectedGlobal : undefined);
      setAddedTags(prev => [...prev, {
        name: selectedTemplate,
        value: tagValue,
        globalName: valueSource === "global" ? selectedGlobal : undefined,
      }]);
      setSelectedTemplate("");
      setTagValue(0);
      setValueSource("manual");
      setSelectedGlobal("");
    }
  };

  const handleDone = () => {
    if (selectedTemplate && (valueSource !== "global" || selectedGlobal)) {
      onAddTag(selectedTemplate, tagValue, pointIndex, valueSource === "global" ? selectedGlobal : undefined);
    }
    setSelectedTemplate("");
    setTagValue(0);
    setValueSource("manual");
    setSelectedGlobal("");
    setAddedTags([]);
    onClose();
  };

  const handleSkip = () => {
    setSelectedTemplate("");
    setTagValue(0);
    setValueSource("manual");
    setSelectedGlobal("");
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
            A-
          </button>
        </div>

        <div className="modal-body">
          {addedTags.length > 0 && (
            <div className="added-tags-list">
              <strong>Tags added to point {pointIndex}:</strong>
              {addedTags.map((tag, idx) => (
                <div key={idx} className="added-tag-item">
                  {tag.name} = {tag.globalName ? `${tag.globalName}: ${tag.value}` : tag.value}
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
                disabled={!selectedTemplate || valueSource === "global"}
              />
            </div>

            <div className="field">
              <label>Value source</label>
              <select
                value={valueSource}
                onChange={(e) => setValueSource(e.target.value)}
                disabled={!selectedTemplate}
              >
                <option value="manual">Manual</option>
                <option value="global" disabled={!globalVars?.length}>Global variable</option>
              </select>
            </div>

            {valueSource === "global" && (
              <div className="field">
                <label>Global variable</label>
                <select
                  value={selectedGlobal}
                  onChange={(e) => setSelectedGlobal(e.target.value)}
                  disabled={!selectedTemplate}
                >
                  <option value="">-- Select global --</option>
                  {globalVars?.map((entry) => (
                    <option key={entry.name} value={entry.name}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
              disabled={valueSource === "global" && !selectedGlobal}
            >
              Add & Continue
            </button>
          )}
          <button
            className="btn primary"
            onClick={handleDone}
            disabled={(!selectedTemplate && addedTags.length === 0) || (valueSource === "global" && !selectedGlobal && selectedTemplate)}
          >
            {selectedTemplate ? "Add & Done" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
