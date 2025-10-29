import {useState} from "react";
import PointEditorPopover from "./PointEditorPopover";

export default function WaypointsDropdown({points, setPoints, onPointSelect, selectedPointIndex, onBeginPlacePoint}) {
  const [open, setOpen] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  function normalizeHeading(angle) {
    let a = angle % 360;
    if (a > 180) a -= 360;
    if (a <= -180) a += 360;
    return a;
  }

  return (
    <div style={{width: '100%', marginTop: 'var(--space-md)'}}>
      <button 
        className="btn ghost" 
        onClick={() => setOpen((v) => !v)} 
        aria-expanded={open} 
        aria-controls="waypoints-dropdown"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-sm) var(--space-md)',
          fontSize: 'var(--text-base)',
          fontWeight: '600',
          background: open ? 'rgba(79, 195, 247, 0.08)' : 'transparent',
          border: open ? '1px solid rgba(79, 195, 247, 0.2)' : '1px solid rgba(255,255,255,0.08)',
          transition: 'all 0.2s ease',
        }}
      >
        <span style={{display: 'flex', alignItems: 'center', gap: 8}}>
          <span style={{
            fontSize: '1.1rem',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.2s ease',
            display: 'inline-block'
          }}>▾</span>
          <span>Waypoints</span>
        </span>
        <span style={{
          background: 'rgba(79, 195, 247, 0.15)',
          color: '#60a5fa',
          padding: '2px 10px',
          borderRadius: '12px',
          fontSize: '0.8rem',
          fontWeight: '700',
          minWidth: '28px',
          textAlign: 'center'
        }}>
          {points?.length ?? 0}
        </span>
      </button>

      {open && points && points.length > 0 && (
        <div 
          id="waypoints-dropdown" 
          style={{
            display: 'flex', 
            flexDirection: 'column', 
            gap: 'var(--space-sm)', 
            marginTop: 'var(--space-sm)',
            animation: 'slideDown 0.25s ease-out',
          }}
        >
          {points.map((point, index) => {
            const displayName = point?.name ?? point?.label ?? `Point ${index + 1}`;
            const expanded = expandedIndex === index;
            const isSelected = selectedPointIndex === index;
            const isHovered = hoveredIndex === index;
            
            return (
              <div 
                key={index} 
                style={{
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: 6,
                  animation: `fadeIn 0.3s ease-out ${index * 0.05}s both`,
                }}
              >
                <div
                  onClick={() => onPointSelect && onPointSelect(index)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                    padding: 'var(--space-md)',
                    background: isSelected 
                      ? 'linear-gradient(135deg, rgba(96, 165, 250, 0.12), rgba(79, 195, 247, 0.08))' 
                      : isHovered 
                        ? 'rgba(255,255,255,0.06)' 
                        : 'rgba(255,255,255,0.03)',
                    border: isSelected 
                      ? '1px solid rgba(96, 165, 250, 0.3)' 
                      : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected 
                      ? '0 2px 8px rgba(96, 165, 250, 0.15)' 
                      : isHovered 
                        ? '0 2px 4px rgba(0,0,0,0.1)' 
                        : 'none',
                    transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
                  }}
                >
                  <div style={{display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0}}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: isSelected 
                        ? 'linear-gradient(135deg, #60a5fa, #4fc3f7)' 
                        : 'rgba(148, 163, 184, 0.15)',
                      color: isSelected ? '#fff' : '#94a3b8',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      flexShrink: 0,
                      boxShadow: isSelected ? '0 2px 6px rgba(96, 165, 250, 0.3)' : 'none',
                      transition: 'all 0.2s ease',
                    }}>{index + 1}</div>

                    <div style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6}}>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (typeof setPoints === 'function') {
                            setPoints((prev) => {
                              const next = [...prev];
                              next[index] = {...(next[index] ?? {}), name: v};
                              return next;
                            });
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={`Point ${index + 1}`}
                        style={{
                          width: '100%', 
                          padding: '8px 12px', 
                          borderRadius: 6, 
                          background: 'rgba(255,255,255,0.04)', 
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: 'var(--text-primary)',
                          fontSize: '0.9rem',
                          fontWeight: '500',
                          transition: 'all 0.2s ease',
                          outline: 'none',
                        }}
                        onFocus={(e) => {
                          e.target.style.background = 'rgba(255,255,255,0.08)';
                          e.target.style.borderColor = 'rgba(96, 165, 250, 0.4)';
                        }}
                        onBlur={(e) => {
                          e.target.style.background = 'rgba(255,255,255,0.04)';
                          e.target.style.borderColor = 'rgba(255,255,255,0.08)';
                        }}
                      />
                      <div style={{
                        display: 'flex',
                        gap: 12,
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.5px',
                      }}>
                        <span style={{display: 'flex', alignItems: 'center', gap: 4}}>
                          <span style={{opacity: 0.6}}>X</span>
                          <span style={{color: '#66bb6a', fontWeight: '600'}}>
                            {Number.isFinite(point.x) ? point.x.toFixed(1) : '-'}
                          </span>
                        </span>
                        <span style={{display: 'flex', alignItems: 'center', gap: 4}}>
                          <span style={{opacity: 0.6}}>Y</span>
                          <span style={{color: '#42a5f5', fontWeight: '600'}}>
                            {Number.isFinite(point.y) ? point.y.toFixed(1) : '-'}
                          </span>
                        </span>
                        <span style={{display: 'flex', alignItems: 'center', gap: 4}}>
                          <span style={{opacity: 0.6}}>H</span>
                          <span style={{color: '#ffa726', fontWeight: '600'}}>
                            {Number.isFinite(point.h) ? point.h.toFixed(0) : '-'}°
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0}}>
                    <button
                      className="btn ghost"
                      onClick={(e) => { e.stopPropagation(); setExpandedIndex((prev) => (prev === index ? null : index)); }}
                      aria-expanded={expanded}
                      aria-controls={`point-${index}-details`}
                      style={{
                        padding: '6px 10px',
                        fontSize: '0.9rem',
                        minWidth: '32px',
                        transition: 'all 0.2s ease',
                        transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                      }}
                    >▾</button>
                  </div>
                </div>

                {expanded && (
                  <div 
                    id={`point-${index}-details`} 
                    style={{
                      padding: 'var(--space-md)',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 8,
                      marginLeft: '44px',
                      animation: 'slideDown 0.2s ease-out',
                    }}
                  >
                    <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                      <label style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          color: 'var(--text-secondary)',
                        }}>Heading (degrees)</span>
                        <div style={{position: 'relative'}}>
                          <input
                            type="number"
                            step={1}
                            value={String(point.h ?? '')}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === '' || value === '-') {
                                setPoints((prev) => { const next = [...prev]; next[index] = {...next[index], h: value}; return next; });
                                return;
                              }
                              const parsed = parseFloat(value);
                              if (!Number.isNaN(parsed)) {
                                setPoints((prev) => { const next = [...prev]; next[index] = {...next[index], h: normalizeHeading(parsed)}; return next; });
                              }
                            }}
                            style={{
                              width: '100%',
                              padding: '8px 36px 8px 12px',
                              borderRadius: 6,
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: 'var(--text-primary)',
                              fontSize: '0.9rem',
                              fontWeight: '500',
                            }}
                          />
                          <span style={{
                            position: 'absolute',
                            right: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#ffa726',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            pointerEvents: 'none',
                          }}>°</span>
                        </div>
                      </label>
                      
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        background: 'rgba(79, 195, 247, 0.08)',
                        borderRadius: 6,
                        border: '1px solid rgba(79, 195, 247, 0.15)',
                      }}>
                        <span style={{fontSize: '1rem'}}>🏷️</span>
                        <span style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>
                          <strong style={{color: '#4fc3f7'}}>{(point.tags || []).length}</strong> tag{(point.tags || []).length !== 1 ? 's' : ''} attached
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateX(-8px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
