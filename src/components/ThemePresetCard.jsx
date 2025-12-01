import React from 'react';

export default function ThemePresetCard({ theme, isActive, onClick }) {
    const { name, colors } = theme;
    
    return (
        <div 
            className={`theme-preset-card ${isActive ? 'active' : ''}`}
            onClick={onClick}
        >
            <div className="theme-swatches">
                <div className="swatch" style={{ background: colors.bg }}></div>
                <div className="swatch" style={{ background: colors.panel }}></div>
                <div className="swatch" style={{ background: colors.accent }}></div>
                <div className="swatch" style={{ background: colors.ok }}></div>
            </div>
            <div className="theme-name">{name}</div>
        </div>
    );
}
