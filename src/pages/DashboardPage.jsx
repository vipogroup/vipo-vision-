import { useState, useRef, useEffect, useCallback } from 'react';
import { Grid2x2, Grid3x3, LayoutGrid, Square, Maximize2, Minimize2 } from 'lucide-react';
import Header from '../components/Header';
import CameraGrid from '../components/CameraGrid';
import { useLanguage } from '../hooks/useLanguage';
import { useCameraStore } from '../stores/cameraStore';

const gridOptions = [
  { size: 1, icon: Square, label: '1' },
  { size: 4, icon: Grid2x2, label: '4' },
  { size: 9, icon: Grid3x3, label: '9' },
  { size: 16, icon: LayoutGrid, label: '16' },
];

export default function DashboardPage() {
  const { t } = useLanguage();
  const [gridSize, setGridSize] = useState(4);
  const [streamMode, setStreamMode] = useState('hd'); // 'hd' or 'live'
  const { cameras } = useCameraStore();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const dashboardRef = useRef(null);

  const toggleFullscreen = useCallback(() => {
    const el = dashboardRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const onlineCount = cameras.filter((c) => c.status === 'online' || c.status === 'motion').length;
  const recordingCount = cameras.filter((c) => c.recording).length;

  return (
    <>
      <Header title={t('dashboard.title')} subtitle={`${cameras.length} ${t('nav.cameras').toLowerCase()}`} />
      <div ref={dashboardRef} className={`flex-1 flex flex-col p-1 sm:p-2 gap-1.5 sm:gap-2 min-h-0 overflow-hidden ${isFullscreen ? 'bg-slate-950' : ''}`}>
        <div className="flex items-center justify-between flex-shrink-0 flex-wrap gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
            {gridOptions.map((opt) => (
              <button
                key={opt.size}
                onClick={() => setGridSize(opt.size)}
                className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-md text-xs font-medium transition-all min-h-[36px] ${
                  gridSize === opt.size
                    ? 'bg-cyan-500/15 text-cyan-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <opt.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{opt.label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-0.5">
              <button
                onClick={() => setStreamMode('hd')}
                className={`px-2 sm:px-3 py-1 rounded-md text-[10px] sm:text-xs font-medium transition-all ${
                  streamMode === 'hd'
                    ? 'bg-cyan-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                HD
              </button>
              <button
                onClick={() => setStreamMode('live')}
                className={`px-2 sm:px-3 py-1 rounded-md text-[10px] sm:text-xs font-medium transition-all ${
                  streamMode === 'live'
                    ? 'bg-cyan-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                LIVE
              </button>
            </div>
            <div className="hidden sm:flex items-center gap-3 md:gap-4 text-[10px] md:text-xs text-slate-400">
              <span className="text-emerald-400">{onlineCount} online</span>
              <span className="text-blue-400">{recordingCount} rec</span>
            </div>
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg bg-slate-800/60 text-slate-300 hover:text-cyan-400 hover:bg-slate-700/60 transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 animate-fade-in">
          <CameraGrid cameras={cameras} gridSize={gridSize} streamMode={streamMode} />
        </div>

      </div>
    </>
  );
}

