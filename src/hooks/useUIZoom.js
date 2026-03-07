import { useContext } from 'react';
import { UIZoomContext } from '../context/UIZoomContextInstance.js';

export function useUIZoom() {
  const ctx = useContext(UIZoomContext);
  if (!ctx) throw new Error('useUIZoom must be used within UIZoomProvider');
  return ctx;
}
