import { useEffect, useCallback } from 'react';

export function usePTZKeyboard(ptz, enabled = true) {
  const handleKeyDown = useCallback(
    (e) => {
      if (!enabled || !ptz) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.repeat) return;

      let handled = true;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          ptz.startContinuousMove('up');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          ptz.startContinuousMove('down');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          ptz.startContinuousMove('left');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          ptz.startContinuousMove('right');
          break;
        case '+':
        case '=':
          ptz.zoomIn();
          break;
        case '-':
        case '_':
          ptz.zoomOut();
          break;
        case ' ':
          ptz.stop();
          break;
        case 'h':
        case 'H':
          ptz.goHome();
          break;
        default:
          handled = false;
          break;
      }

      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [ptz, enabled]
  );

  const handleKeyUp = useCallback(
    (e) => {
      if (!enabled || !ptz) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

      const moveKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'W', 'a', 'A', 's', 'S', 'd', 'D'];
      if (moveKeys.includes(e.key)) {
        ptz.stopContinuousMove();
      }
    },
    [ptz, enabled]
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp, enabled]);
}
