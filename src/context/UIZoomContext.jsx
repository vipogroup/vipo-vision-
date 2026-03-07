import { useState, useCallback } from 'react';
import { UIZoomContext } from './UIZoomContextInstance.js';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;
const STEP = 0.1;

export function UIZoomProvider({ children }) {
  const [zoom, setZoom] = useState(() => {
    try {
      const saved = localStorage.getItem('vipo-ui-zoom');
      return saved ? parseFloat(saved) : 1.0;
    } catch {
      return 1.0;
    }
  });

  const setAndSave = useCallback((val) => {
    const clamped = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, val)) * 100) / 100;
    setZoom(clamped);
    try { localStorage.setItem('vipo-ui-zoom', String(clamped)); } catch { /* */ }
  }, []);

  const zoomIn = useCallback(() => setAndSave(zoom + STEP), [zoom, setAndSave]);
  const zoomOut = useCallback(() => setAndSave(zoom - STEP), [zoom, setAndSave]);
  const resetZoom = useCallback(() => setAndSave(1.0), [setAndSave]);

  return (
    <UIZoomContext.Provider value={{ zoom, zoomIn, zoomOut, resetZoom, MIN_ZOOM, MAX_ZOOM }}>
      {children}
    </UIZoomContext.Provider>
  );
}
