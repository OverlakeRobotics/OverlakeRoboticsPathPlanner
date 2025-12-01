import { useEffect } from 'react';
import { THEME_PRESETS } from "../constants/themes";

export function useTheme(settings) {
    useEffect(() => {
        const root = document.documentElement;
        
        // Apply UI Effects
        root.style.setProperty('--blur-strength', `${settings.blurStrength}px`);
        root.style.setProperty('--panel-opacity', settings.panelOpacity);
        root.style.setProperty('--card-opacity', settings.cardOpacity);
        root.style.setProperty('--scale-factor', settings.uiScale);
        
        // Determine colors
        // Start with default theme colors
        let colors = { ...THEME_PRESETS.default.colors };
        
        // If a specific theme is selected, use its colors
        if (settings.themeName && THEME_PRESETS[settings.themeName]) {
            colors = { ...colors, ...THEME_PRESETS[settings.themeName].colors };
        }
        
        // Override with custom palette if provided (this handles the canvas colors)
        if (settings.palette) {
             colors = { ...colors, ...settings.palette };
        }

        // Apply all colors to CSS variables
        Object.entries(colors).forEach(([key, value]) => {
             root.style.setProperty(`--${key}`, value);
             
             // Generate RGB values for rgba() usage
             if (typeof value === 'string' && value.startsWith('#')) {
                 const hex = value.replace('#', '');
                 if (hex.length === 6) {
                     const r = parseInt(hex.substring(0, 2), 16);
                     const g = parseInt(hex.substring(2, 4), 16);
                     const b = parseInt(hex.substring(4, 6), 16);
                     root.style.setProperty(`--${key}-rgb`, `${r}, ${g}, ${b}`);
                 }
             }
        });

    }, [settings]);
}
