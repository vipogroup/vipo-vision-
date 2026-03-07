import { Bell, Search, Maximize2, Clock, ZoomIn, ZoomOut, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useUIZoom } from '../hooks/useUIZoom';
import DiagnosticsPanel from './DiagnosticsPanel';

export default function Header({ title, subtitle }) {
  const { user } = useAuth();
  const { zoom, zoomIn, zoomOut, resetZoom } = useUIZoom();
  const [time, setTime] = useState(new Date());
  const [showNotifications, setShowNotifications] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const notifications = [
    { id: 1, text: 'Motion detected — Office Floor 3', time: '1m ago', type: 'warning' },
    { id: 2, text: 'Warehouse East camera offline', time: '2h ago', type: 'critical' },
    { id: 3, text: 'Recording storage at 78%', time: '3h ago', type: 'info' },
  ];

  return (
    <>
    <header className="h-16 bg-slate-900/40 backdrop-blur-sm border-b border-slate-800/40 flex items-center justify-between px-6 flex-shrink-0">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 bg-slate-800/40 px-3 py-1.5 rounded-lg">
          <Clock className="w-3.5 h-3.5" />
          <span className="font-mono">
            {time.toLocaleTimeString('en-US', { hour12: false })}
          </span>
        </div>

        <button className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors">
          <Search className="w-4.5 h-4.5" />
        </button>

        <div className="flex items-center gap-0.5 bg-slate-800/40 rounded-lg px-1 py-0.5">
          <button
            onClick={zoomOut}
            disabled={zoom <= 0.5}
            className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={resetZoom}
            className="px-1.5 py-1 rounded text-[10px] font-mono font-medium text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors min-w-[40px] text-center"
            title="Reset Zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={zoomIn}
            disabled={zoom >= 1.5}
            className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => setShowDiagnostics(true)}
          className="p-2 rounded-lg text-amber-400/70 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
          title="Diagnostics & Testing"
        >
          <Zap className="w-4.5 h-4.5" />
        </button>

        <button className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors">
          <Maximize2 className="w-4.5 h-4.5" />
        </button>

        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors relative"
          >
            <Bell className="w-4.5 h-4.5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse-dot" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-slate-800 border border-slate-700/60 rounded-xl shadow-2xl shadow-black/40 z-50 animate-fade-in overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/60">
                <h3 className="text-sm font-semibold text-white">Notifications</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="px-4 py-3 border-b border-slate-700/30 hover:bg-slate-700/30 transition-colors cursor-pointer"
                  >
                    <p className="text-sm text-slate-200">{n.text}</p>
                    <p className="text-xs text-slate-500 mt-1">{n.time}</p>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 text-center">
                <button className="text-xs text-cyan-400 hover:text-cyan-300 font-medium">
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-8 bg-slate-800 mx-1" />

        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="hidden lg:block">
            <p className="text-sm font-medium text-slate-200">{user?.name}</p>
            <p className="text-[10px] text-slate-500 capitalize">{user?.role}</p>
          </div>
        </div>
      </div>
    </header>

    <DiagnosticsPanel
      isOpen={showDiagnostics}
      onClose={() => setShowDiagnostics(false)}
    />
    </>
  );
}
