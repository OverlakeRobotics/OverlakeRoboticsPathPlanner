import { useEffect, useRef } from 'react';

/**
 * Custom hook for managing keyboard shortcuts
 * @param {Object} shortcuts - Object mapping keys to handler functions
 * @param {boolean} enabled - Whether shortcuts are enabled (default: true)
 * @param {Object} options - Additional options
 * @returns {Object} - Object with platform info and helper functions
 */
export const useKeyboardShortcuts = (shortcuts = {}, enabled = true, options = {}) => {
  const {
    preventDefault = true,
    stopPropagation = false,
    ignoreInputFields = true,
  } = options;

  const shortcutsRef = useRef(shortcuts);
  
  // Update shortcuts ref when shortcuts change
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  // Detect platform for key symbol display
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const modifierKey = isMac ? 'Meta' : 'Control';
  const modifierSymbol = isMac ? '⌘' : 'Ctrl';

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event) => {
      // Check if user is typing in an input field
      if (ignoreInputFields) {
        const target = event.target;
        const tagName = target.tagName.toLowerCase();
        const isEditable = target.isContentEditable;
        
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || isEditable) {
          return;
        }
      }

      // Build key string with modifiers
      const modifiers = [];
      if (event.ctrlKey || event.metaKey) modifiers.push('ctrl');
      if (event.shiftKey) modifiers.push('shift');
      if (event.altKey) modifiers.push('alt');

      const key = event.key.toLowerCase();
      
      // Create key combinations
      const keyString = modifiers.length > 0 
        ? `${modifiers.join('+')}+${key}`
        : key;

      // Also check without modifiers for simple keys
      const handlers = shortcutsRef.current;
      
      // Try with full key combination first
      if (handlers[keyString]) {
        if (preventDefault) event.preventDefault();
        if (stopPropagation) event.stopPropagation();
        handlers[keyString](event);
        return;
      }

      // Try with just the key for non-modifier shortcuts
      if (handlers[key] && modifiers.length === 0) {
        if (preventDefault) event.preventDefault();
        if (stopPropagation) event.stopPropagation();
        handlers[key](event);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, preventDefault, stopPropagation, ignoreInputFields]);

  return {
    isMac,
    modifierKey,
    modifierSymbol,
  };
};

/**
 * Helper function to format key combinations for display
 * @param {string} keyCombo - Key combination string (e.g., "ctrl+z")
 * @param {boolean} isMac - Whether the platform is Mac
 * @returns {string} - Formatted key combination for display
 */
export const formatKeyCombo = (keyCombo, isMac = false) => {
  const parts = keyCombo.split('+').map(part => {
    const normalized = part.toLowerCase().trim();
    
    if (normalized === 'ctrl' || normalized === 'control') {
      return isMac ? '⌘' : 'Ctrl';
    }
    if (normalized === 'shift') return 'Shift';
    if (normalized === 'alt') return isMac ? '⌥' : 'Alt';
    if (normalized === 'meta') return isMac ? '⌘' : 'Win';
    
    // Capitalize single letters
    if (part.length === 1) return part.toUpperCase();
    
    // Capitalize first letter of longer keys
    return part.charAt(0).toUpperCase() + part.slice(1);
  });
  
  return parts.join(isMac ? '' : '+');
};

export default useKeyboardShortcuts;