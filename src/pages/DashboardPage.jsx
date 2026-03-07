import { useState } from 'react';
import { Camera, Video, AlertTriangle, HardDrive, Grid2x2, Grid3x3, LayoutGrid, Square } from 'lucide-react';
import Header from '../components/Header';
import StatsCard from '../components/StatsCard';
import CameraGrid from '../components/CameraGrid';
import { useLanguage } from '../hooks/useLanguage';
import { events } from '../data/events';
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

  const onlineCount = cameras.filter((c) => c.status === 'online' || c.status === 'motion').length;
  const _OfflineCount = cameras.filter((c) => c.status === 'offline').length;
  const recordingCount = cameras.filter((c) => c.recording).length;
  const _RecentEvents = events.filter((e) => !e.acknowledged).length;

  return (
    <>
      <Header title={t('dashboard.title')} subtitle={`${cameras.length} ${t('nav.cameras').toLowerCase()}`} />
      <div className="flex-1 flex flex-col p-1 sm:p-2 gap-1.5 sm:gap-2 min-h-0 overflow-hidden">
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
          </div>
        </div>

        <div className="flex-1 min-h-0 animate-fade-in">
          <CameraGrid cameras={cameras} gridSize={gridSize} streamMode={streamMode} />
        </div>

        <div className="hidden grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Recent Events</h3>
            <div className="space-y-2">
              {events.slice(0, 5).map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        event.severity === 'critical'
                          ? 'bg-red-400'
                          : event.severity === 'warning'
                          ? 'bg-amber-400'
                          : 'bg-blue-400'
                      }`}
                    />
                    <div>
                      <p className="text-sm text-slate-200">{event.message}</p>
                      <p className="text-xs text-slate-500">{event.cameraName}</p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0 ml-4">
                    {new Date(event.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">System Status</h3>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-400">Storage Usage</span>
                  <span className="text-slate-300 font-medium">78%</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full w-[78%] bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-400">CPU Load</span>
                  <span className="text-slate-300 font-medium">42%</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full w-[42%] bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-400">Memory</span>
                  <span className="text-slate-300 font-medium">61%</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full w-[61%] bg-gradient-to-r from-amber-500 to-amber-400 rounded-full" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-400">Network</span>
                  <span className="text-slate-300 font-medium">124 Mbps</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full w-[62%] bg-gradient-to-r from-purple-500 to-purple-400 rounded-full" />
                </div>
              </div>
              <div className="pt-2 border-t border-slate-800/50">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-slate-800/40 rounded-lg py-2">
                    <p className="text-lg font-bold text-white">4.2 TB</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total Storage</p>
                  </div>
                  <div className="bg-slate-800/40 rounded-lg py-2">
                    <p className="text-lg font-bold text-white">99.7%</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Uptime</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

