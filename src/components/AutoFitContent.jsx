import { useRef, useEffect, useCallback } from 'react';

export default function AutoFitContent({ children, className = '' }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const rafRef = useRef(null);

  const recalc = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    rafRef.current = requestAnimationFrame(() => {
      const outer = outerRef.current;
      const inner = innerRef.current;
      if (!outer || !inner) return;

      // Reset zoom to measure natural content size
      inner.style.zoom = '1';

      const availableH = outer.clientHeight;
      const availableW = outer.clientWidth;
      const contentH = inner.scrollHeight;
      const contentW = inner.scrollWidth;

      if (availableH > 0 && availableW > 0) {
        const scaleH = contentH > availableH ? availableH / contentH : 1;
        const scaleW = contentW > availableW ? availableW / contentW : 1;
        const newScale = Math.max(0.35, Math.min(1, scaleH, scaleW));
        inner.style.zoom = String(newScale);
      }
    });
  }, []);

  useEffect(() => {
    recalc();
    const ro = new ResizeObserver(() => recalc());
    if (outerRef.current) ro.observe(outerRef.current);
    return () => {
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [recalc]);

  // Recalculate when children change (route navigation)
  useEffect(() => {
    const t = setTimeout(recalc, 60);
    return () => clearTimeout(t);
  }, [children, recalc]);

  return (
    <div ref={outerRef} className={`flex-1 overflow-hidden ${className}`}>
      <div
        ref={innerRef}
        className="flex flex-col min-h-full"
      >
        {children}
      </div>
    </div>
  );
}
