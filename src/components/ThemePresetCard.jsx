export default function ThemePresetCard({ theme, isActive, onClick }) {
    const { name, colors } = theme;

    return (
        <button
            type="button"
            className={`theme-preset-card ${isActive ? 'active' : ''}`}
            onClick={onClick}
            aria-pressed={isActive}
        >
            <div className="theme-swatches" aria-hidden="true">
                <div className="swatch" style={{ background: colors.bg }}></div>
                <div className="swatch" style={{ background: colors.panel }}></div>
                <div className="swatch" style={{ background: colors.accent }}></div>
                <div className="swatch" style={{ background: colors.ok }}></div>
            </div>
            <div className="theme-name">{name}</div>
        </button>
    );
}
