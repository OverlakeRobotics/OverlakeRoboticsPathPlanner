import { useEffect, useRef, useState } from "react";
import TAG_REGISTRY from "../constants/tags";

/**
 * Inline point editor with collapsible tag panels, value summaries, and clear ordering.
 */
export default function PointEditorPopover({ point, index, position, onSave, onCancel, onChange }) {
  const [heading, setHeading] = useState(point?.h ?? 0);
  const [tagText, setTagText] = useState("");
  const [selectedTagId, setSelectedTagId] = useState(null);
  const [selectedTagParams, setSelectedTagParams] = useState({});
  const normalize = (t) => {
    if (!t) return null;
    if (t.id) return { id: t.id, label: t.label ?? t.id, params: { ...(t.params ?? {}) } };
    if (t.name) return { id: t.name, label: t.name, params: { value: t.value } };
    return { id: String(t), label: String(t), params: {} };
  };
  const [tags, setTags] = useState((point?.tags ?? []).map(normalize));
  const [expandedTag, setExpandedTag] = useState(null);
  const [dragInfo, setDragInfo] = useState(null); // {fromIdx}
  const [dragOver, setDragOver] = useState(null); // {toIdx}
  const rootRef = useRef(null);
  const tagInputRef = useRef(null);

  useEffect(() => {
    setHeading(point?.h ?? 0);
    setTags((point?.tags ?? []).map(normalize));
  }, [point]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel?.();
      } else if (e.key === "Enter") {
        // If the Enter originated from an input/select/textarea inside the popover,
        // don't treat it as a global Save; let the element's own handlers run (e.g., add tag).
        const tgt = e.target;
        if (rootRef.current && rootRef.current.contains(tgt)) {
          const tagName = (tgt && tgt.tagName) || '';
          if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) {
            return;
          }
        }
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [heading, tags, onSave, onCancel]);

  useEffect(() => {
    if (rootRef.current) rootRef.current.focus();
  }, []);

  function emitChange(partial) {
    onChange?.(partial);
  }

  function handleSave() {
    // If the user has selected a tag from the suggestions but didn't click Add,
    // automatically include it (so we don't silently lose their work).
    let finalTags = [...tags];
    if (selectedTagId) {
      const reg = TAG_REGISTRY.find((r) => r.id === selectedTagId);
      if (reg) {
        const pending = { id: reg.id, label: reg.label, params: { ...selectedTagParams } };
        finalTags = [...finalTags, pending];
      }
    }

    const updated = {
      ...point,
      h: Number(heading),
      tags: finalTags.length ? finalTags.map((t) => ({ id: t.id, label: t.label, params: t.params })) : undefined,
    };
    // Clear selection state after save
    setSelectedTagId(null);
    setSelectedTagParams({});
    onSave?.(updated, index);
  }

  function addTagFromRegistry(reg) {
    const params = {};
    (reg.params || []).forEach((p) => (params[p.name] = p.default ?? ""));
    return { id: reg.id, label: reg.label, params };
  }

  function handleAddTag() {
    const t = tagText.trim();
    if (!t) return;
    let tag;
    if (selectedTagId) {
      const reg = TAG_REGISTRY.find((r) => r.id === selectedTagId);
      tag = { id: reg.id, label: reg.label, params: { ...selectedTagParams } };
    } else {
      const reg = TAG_REGISTRY.find((r) => r.label === t || r.id === t);
      tag = reg ? addTagFromRegistry(reg) : { id: t, label: t, params: {} };
    }
    const next = [...tags, tag];
    setTags(next);
    setTagText("");
    setSelectedTagId(null);
    setSelectedTagParams({});
    // blur the input so the datalist dropdown closes on all browsers
    try { tagInputRef.current?.blur(); } catch (e) {}
    setExpandedTag(tag.id); // auto-expand on creation
    emitChange({ tags: next });
  }

  function handleRemoveTag(i) {
    const next = tags.filter((_, idx) => idx !== i);
    setTags(next);
    emitChange({ tags: next });
    if (expandedTag === tags[i]?.id) setExpandedTag(null);
  }

  function handleParamChange(tagIndex, paramName, value) {
    const next = tags.map((t, idx) => {
      if (idx !== tagIndex) return t;
      return { ...t, params: { ...t.params, [paramName]: value } };
    });
    setTags(next);
    emitChange({ tags: next });
  }

  // Drag-and-drop handlers for reordering tags inside the popover
  function handleDragStart(e, fromIdx) {
    setDragInfo({ fromIdx });
    try {
      e.dataTransfer.setData('text/plain', JSON.stringify({ fromIdx }));
      e.dataTransfer.effectAllowed = 'move';
    } catch (err) {}
  }

  function handleDragOver(e, toIdx) {
    e.preventDefault();
    setDragOver({ toIdx });
    try { e.dataTransfer.dropEffect = 'move'; } catch (err) {}
  }

  function handleDrop(e, toIdx) {
    e.preventDefault();
    let info = dragInfo;
    try {
      const raw = e.dataTransfer.getData('text/plain');
      if (raw) info = JSON.parse(raw);
    } catch (err) {}
    if (!info) {
      setDragInfo(null);
      setDragOver(null);
      return;
    }
    const { fromIdx } = info;
    if (fromIdx == null) return;

    setTags((prev) => {
      const next = [...prev];
      if (fromIdx < 0 || fromIdx >= next.length) return prev;
      const [moved] = next.splice(fromIdx, 1);
      // adjust insertion index if removing earlier in the array
      let insertIdx = toIdx;
      if (insertIdx == null || insertIdx < 0) insertIdx = next.length;
      if (fromIdx < toIdx) insertIdx = Math.max(0, insertIdx - 1);
      if (insertIdx > next.length) insertIdx = next.length;
      next.splice(insertIdx, 0, moved);
      emitChange({ tags: next });
      return next;
    });

    setDragInfo(null);
    setDragOver(null);
  }

  function handleDragEnd() {
    setDragInfo(null);
    setDragOver(null);
  }

  function handleHeadingChange(val) {
    setHeading(val);
    emitChange({ h: Number(val) });
  }

  // Dynamically adjust popover position to avoid being hidden by panels
  const popoverWidth = 340;
  const popoverHeight = 450; // approximate max height
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Detect the canvas element and compute displayed (CSS) coordinates
  const canvas = document.querySelector('canvas[role="img"]');
  const margin = 10;

  // default to full-viewport safe zone if canvas not found
  let canvasWidth = viewportWidth;
  let canvasHeight = viewportHeight;
  let rectWidth = viewportWidth;
  let rectHeight = viewportHeight;

  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    rectWidth = rect.width;
    rectHeight = rect.height;
    // canvas.width/height are the internal pixel buffer sizes
    canvasWidth = canvas.width || rectWidth;
    canvasHeight = canvas.height || rectHeight;
  }

  // scale from internal canvas coords to displayed CSS pixels
  const scaleX = rectWidth / canvasWidth;
  const scaleY = rectHeight / canvasHeight;

  // canvas-local displayed bounds (relative to canvas-stack)
  const leftBound = margin;
  const rightBound = rectWidth - margin;
  const topBound = margin;
  const bottomBound = rectHeight - margin;

  // Start with point in internal canvas coords (cx/cy) and convert to displayed pixels
  const pointX = (position?.left ?? 0) * scaleX;
  const pointY = (position?.top ?? 0) * scaleY;

  let left = pointX + 12;
  let top = pointY - 8;

  // Check if default position (to the right of point) would overflow canvas right edge
  if (left + popoverWidth > rightBound) {
    // Position to the LEFT of the point instead
    left = pointX - popoverWidth - 12;
  }

  // If positioning to the left would overflow canvas left edge, try right again or clamp
  if (left < leftBound) {
    // Try positioning to the right of the point
    const rightPosition = pointX + 12;
    if (rightPosition + popoverWidth <= rightBound) {
      // Right side has room within canvas
      left = rightPosition;
    } else {
      // Neither side has full room - clamp to canvas left edge
      left = leftBound;
    }
  }

  // Ensure we stay within canvas right boundary
  if (left + popoverWidth > rightBound) {
    left = Math.max(leftBound, rightBound - popoverWidth);
  }

  // Vertical positioning - stay close to point and within canvas
  if (top + popoverHeight > bottomBound) {
    // Flip above the point, staying close
    top = pointY - popoverHeight - 12;
    // If that goes off the canvas top, clamp to canvas top
    if (top < topBound) {
      top = topBound;
    }
  }

  // Final clamp to ensure visibility within canvas
  if (top < topBound) {
    top = topBound;
  }
  if (top + popoverHeight > bottomBound) {
    top = Math.max(topBound, bottomBound - popoverHeight);
  }

  const style = {
    position: "absolute",
    left,
    top,
    width: 340,
    maxWidth: "38vw",
    background: "rgba(15,23,42,0.98)",
    color: "#e2e8f0",
    borderRadius: 10,
    padding: 14,
    boxShadow: "0 8px 28px rgba(2,6,23,0.6)",
    zIndex: 10001,
    fontSize: 13,
  };

  return (
    <div ref={rootRef} style={style} role="dialog" aria-label={`Edit point ${index + 1}`} tabIndex={-1}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>Point #{index + 1}</strong>
        <div style={{ opacity: 0.8, fontSize: 12 }}>Enter to save · Esc to cancel</div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {/* Heading input */}
        <label style={{ display: "flex", flexDirection: "column" }}>
          Heading (°)
          <input
            type="number"
            step={1}
            value={String(heading)}
            onChange={(e) => handleHeadingChange(e.target.value)}
            style={{
              marginTop: 6,
              padding: "6px 8px",
              borderRadius: 6,
              background: "rgba(255,255,255,0.05)",
              color: "#e2e8f0",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          />
        </label>

        {/* Tag entry */}
        <label style={{ display: "flex", flexDirection: "column" }}>
          Tags
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input
              type="text"
              list="tag-suggestions"
              placeholder="type to add tag"
              ref={tagInputRef}
              value={tagText}
              onChange={(e) => {
                const v = e.target.value;
                setTagText(v);
                const match = TAG_REGISTRY.find((r) => r.label === v || r.id === v);
                if (match) {
                  // use the registry id and populate editable params so user can tweak before Add
                  setSelectedTagId(match.id);
                  const defaults = {};
                  (match.params || []).forEach((p) => (defaults[p.name] = p.default ?? ""));
                  setSelectedTagParams(defaults);
                  // delay slightly to allow native selection event to complete then blur
                  setTimeout(() => {
                    try { tagInputRef.current?.blur(); } catch (e) {}
                  }, 0);
                } else {
                  setSelectedTagId(null);
                  setSelectedTagParams({});
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              style={{
                flex: 1,
                padding: "6px 8px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.05)",
                color: "#e2e8f0",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
            <button className="btn pill" onClick={handleAddTag} style={{ padding: "6px 10px" }}>
              Add
            </button>
          </div>
          <datalist id="tag-suggestions">
            {TAG_REGISTRY.map((t) => (
              <option key={t.id} value={t.label}>
                {t.description}
              </option>
            ))}
          </datalist>
        </label>

        {/* Selected tag param editor (before adding) */}
        {selectedTagId && (
          <div style={{ display: "grid", gap: 6 }}>
            {(
              TAG_REGISTRY.find((r) => r.id === selectedTagId)?.params || []
            ).map((p) => (
              <label key={p.name} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ minWidth: 90, color: "var(--text-secondary)", fontSize: 12 }}>{p.name}</div>
                <input
                  type={p.type === "number" ? "number" : "text"}
                  step={p.step ?? 1}
                  value={selectedTagParams[p.name] ?? ""}
                  onChange={(e) => setSelectedTagParams(prev => ({ ...prev, [p.name]: p.type === 'number' ? Number(e.target.value) : e.target.value }))}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.05)",
                    color: "#e2e8f0",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                />
              </label>
            ))}
          </div>
        )}
        {/* Reminder for pending (selected but not added) tag */}
        {selectedTagId && !(tags.some(t => t.id === selectedTagId && JSON.stringify(t.params) === JSON.stringify(selectedTagParams))) && (
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:6,padding:8,background:'rgba(255,165,0,0.06)',borderRadius:6,border:'1px solid rgba(255,165,0,0.12)'}}>
            <div style={{flex:1,fontSize:13,color:'var(--text-secondary)'}}>You have a pending tag selected — add it now or discard before saving.</div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn ghost" onClick={() => { setSelectedTagId(null); setSelectedTagParams({}); }}>Discard</button>
              <button className="btn" onClick={() => { handleAddTag(); }}>Add now</button>
            </div>
          </div>
        )}

        {/* Tag list */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "28vh", overflowY: "auto" }}
          onDragOver={(e) => {
            // allow dropping at end of list
            e.preventDefault();
            setDragOver({ toIdx: tags.length });
          }}
          onDrop={(e) => handleDrop(e, tags.length)}
        >
          {tags.map((t, i) => {
            const showPlaceholderBefore = dragOver && dragOver.toIdx === i;
            const reg = TAG_REGISTRY.find((r) => r.id === t.id);
            const isExpanded = expandedTag === t.id;
            const hasParams = reg && reg.params && reg.params.length > 0;

            return (
              <div key={`tag-container-${i}`}>
                {showPlaceholderBefore && (
                  <div
                    key={`placeholder-${i}`}
                    style={{
                      height: 8,
                      marginBottom: 6,
                      borderRadius: 6,
                      background: 'linear-gradient(90deg, rgba(79,195,247,0.18), rgba(96,165,250,0.06))',
                      transition: 'height 140ms ease, opacity 140ms ease'
                    }}
                  />
                )}

                <div
                  key={i}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDrop={(e) => handleDrop(e, i)}
                  onDragEnd={handleDragEnd}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    padding: 8,
                    borderRadius: 8,
                    transition: 'transform 120ms ease, box-shadow 120ms ease',
                    boxShadow: dragOver && dragOver.toIdx === i ? '0 6px 18px rgba(79,195,247,0.06)' : 'none',
                    transform: dragInfo && dragInfo.fromIdx === i ? 'scale(0.98)' : 'none'
                  }}
                >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: hasParams ? "pointer" : "default",
                  }}
                  onClick={() => hasParams && setExpandedTag(isExpanded ? null : t.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.6,
                        width: 18,
                        textAlign: "right",
                      }}
                    >
                      {i + 1}.
                    </div>
                    <div style={{ fontWeight: 600 }}>{t.label}</div>
                    {!isExpanded && hasParams && (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        (
                        {reg.params
                          .map((p) => `${p.name}: ${t.params?.[p.name] ?? "?"}`)
                          .join(", ")}
                        )
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveTag(i);
                    }}
                    aria-label={`Remove tag ${t.label}`}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "rgba(226,232,240,0.7)",
                      cursor: "pointer",
                      fontSize: 14,
                      padding: "2px 6px",
                      borderRadius: 6,
                    }}
                  >
                    ✕
                  </button>
                </div>

                {isExpanded && hasParams && (
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    {reg.params.map((p) => (
                      <label key={p.name} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ minWidth: 90, color: "var(--text-secondary)", fontSize: 12 }}>{p.name}</div>
                        <input
                          type={p.type === "number" ? "number" : "text"}
                          step={p.step ?? 1}
                          value={t.params?.[p.name] ?? ""}
                          onChange={(e) =>
                            handleParamChange(i, p.name, p.type === "number" ? Number(e.target.value) : e.target.value)
                          }
                          style={{
                            flex: 1,
                            padding: "6px 8px",
                            borderRadius: 6,
                            background: "rgba(255,255,255,0.05)",
                            color: "#e2e8f0",
                            border: "1px solid rgba(255,255,255,0.1)",
                          }}
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>

        {/* Footer buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button className="btn secondary" onClick={() => onCancel?.()}>
            Cancel
          </button>
          <button className="btn" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
