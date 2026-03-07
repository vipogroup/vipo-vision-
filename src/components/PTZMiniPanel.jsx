import { useState, useEffect, useCallback, createElement } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Home, X, ZoomIn, ZoomOut } from 'lucide-react';
import { usePTZ } from '../hooks/usePTZ';

export default function PTZMiniPanel({ camera, onClose, style }) {
  const ptz = usePTZ(camera.id, camera);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  if (!camera.ptzSupported) return null;

  const btn = (dir, Btn) => (
    <button
      onMouseDown={() => ptz.startContinuousMove(dir)}
      onMouseUp={() => ptz.stopContinuousMove()}
      onMouseLeave={() => ptz.stopContinuousMove()}
      className={`p-1.5 rounded-md transition-all duration-100 ${
        ptz.activeDirection === dir
          ? 'bg-cyan-500/30 text-cyan-300 scale-90'
          : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/60 hover:text-white active:scale-90'
      }`}
    >
      {createElement(Btn, { className: 'w-3.5 h-3.5' })}
    </button>
  );

  return (
    <div
      className={`absolute z-40 bg-slate-900/95 backdrop-blur-md border border-slate-700/60 rounded-xl shadow-2xl shadow-black/50 p-3 transition-all duration-200 ${
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
      }`}
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-white truncate max-w-[120px]">{camera.name}</span>
        <button onClick={handleClose} className="p-0.5 rounded text-slate-500 hover:text-white transition-colors">
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="grid grid-cols-3 gap-0.5 w-fit">
          <div />
          {btn('up', ChevronUp)}
          <div />
          {btn('left', ChevronLeft)}
          <button
            onClick={ptz.goHome}
            className="p-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
          </button>
          {btn('right', ChevronRight)}
          <div />
          {btn('down', ChevronDown)}
          <div />
        </div>

        <div className="flex flex-col gap-1">
          <button
            onClick={ptz.zoomIn}
            className="p-1.5 rounded-md bg-slate-700/60 text-slate-300 hover:bg-slate-600/60 hover:text-white transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={ptz.zoomOut}
            className="p-1.5 rounded-md bg-slate-700/60 text-slate-300 hover:bg-slate-600/60 hover:text-white transition-colors"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
