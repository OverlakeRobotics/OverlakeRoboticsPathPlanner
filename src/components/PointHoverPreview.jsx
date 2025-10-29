/**
 * Lightweight hover preview tooltip for point inspection
 * Shows basic point info without opening the full editor
 */
export default function PointHoverPreview({ point, index, position, type = 'waypoint' }) {
  if (!point || !position) return null;

  const style = {
    position: 'absolute',
    left: position.left + 12,
    top: position.top - 8,
    background: 'rgba(15, 23, 42, 0.95)',
    color: '#e2e8f0',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 12,
    lineHeight: '1.5',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
    zIndex: 50,
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    backdropFilter: 'blur(4px)',
  };

  const isStartPoint = type === 'start';

  return (
    <div style={style} role="tooltip">
      <div style={{ fontWeight: 600, marginBottom: 4, color: isStartPoint ? '#10b981' : '#60a5fa' }}>
        {isStartPoint ? '🏁 Start Position' : `📍 Point #${index + 1}`}
      </div>
      <div style={{ display: 'grid', gap: 4, fontSize: 11, color: 'rgba(226, 232, 240, 0.9)' }}>
        <div>X: {point.x?.toFixed(1)}" · Y: {point.y?.toFixed(1)}"</div>
        <div>Heading: {point.h?.toFixed(0) ?? 0}°</div>
        {point.tags && point.tags.length > 0 && (
          <div style={{ marginTop: 2, color: 'rgba(226, 232, 240, 0.85)' }}>
            <div style={{ fontSize: 11, color: 'rgba(226, 232, 240, 0.7)', marginBottom: 4 }}>Tags:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {point.tags.map((t, i) => {
                const label = t.label ?? t.id ?? t.name ?? String(t);
                const params = t.params ?? (t.params === undefined && t.value != null ? { value: t.value } : {});
                const paramStr = params && Object.keys(params).length
                  ? Object.entries(params).map(([k, v]) => `${k}=${v}`).join(', ')
                  : null;
                return (
                  <div key={i} style={{ fontSize: 11, color: 'rgba(226, 232, 240, 0.9)' }}>
                    <strong style={{ color: '#e2e8f0' }}>{label}</strong>
                    {paramStr ? <span style={{ marginLeft: 6, color: 'rgba(226,232,240,0.75)' }}>({paramStr})</span> : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(226, 232, 240, 0.6)', fontStyle: 'italic' }}>
        Click to edit
      </div>
    </div>
  );
}