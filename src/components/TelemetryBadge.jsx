import { Wifi, WifiOff, Activity, Signal, Zap } from 'lucide-react';

const qualityConfig = {
  excellent: { color: 'text-emerald-400', bg: 'bg-emerald-400', label: 'Excellent', bars: 4 },
  good: { color: 'text-cyan-400', bg: 'bg-cyan-400', label: 'Good', bars: 3 },
  fair: { color: 'text-amber-400', bg: 'bg-amber-400', label: 'Fair', bars: 2 },
  offline: { color: 'text-red-400', bg: 'bg-red-400', label: 'Offline', bars: 0 },
};

function SignalBars({ bars, color }) {
  return (
    <div className="flex items-end gap-px h-3">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`w-[3px] rounded-sm transition-all duration-300 ${
            i <= bars ? color : 'bg-slate-700'
          }`}
          style={{ height: `${i * 25}%` }}
        />
      ))}
    </div>
  );
}

export default function TelemetryBadge({ telemetry, compact = false, showDetails = false }) {
  if (!telemetry) return null;

  const q = qualityConfig[telemetry.connectionQuality] || qualityConfig.offline;
  const isOnline = telemetry.connectionQuality !== 'offline';

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <SignalBars bars={q.bars} color={q.bg} />
        {isOnline && (
          <span className={`text-[9px] font-mono ${q.color}`}>{telemetry.rttMs}ms</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Wifi className={`w-3.5 h-3.5 ${q.color}`} />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-red-400" />
          )}
          <span className={`text-xs font-medium ${q.color}`}>{q.label}</span>
        </div>
        <SignalBars bars={q.bars} color={q.bg} />
      </div>

      {showDetails && isOnline && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-800/40 rounded-lg px-2.5 py-2">
            <div className="flex items-center gap-1 mb-1">
              <Zap className="w-3 h-3 text-cyan-400" />
              <span className="text-[9px] text-slate-500 uppercase tracking-wider">Latency</span>
            </div>
            <p className="text-sm font-mono font-bold text-white">{telemetry.rttMs}<span className="text-[10px] text-slate-400 ml-0.5">ms</span></p>
          </div>
          <div className="bg-slate-800/40 rounded-lg px-2.5 py-2">
            <div className="flex items-center gap-1 mb-1">
              <Activity className="w-3 h-3 text-emerald-400" />
              <span className="text-[9px] text-slate-500 uppercase tracking-wider">FPS</span>
            </div>
            <p className="text-sm font-mono font-bold text-white">{telemetry.fps}<span className="text-[10px] text-slate-400 ml-0.5">fps</span></p>
          </div>
          <div className="bg-slate-800/40 rounded-lg px-2.5 py-2">
            <div className="flex items-center gap-1 mb-1">
              <Signal className="w-3 h-3 text-blue-400" />
              <span className="text-[9px] text-slate-500 uppercase tracking-wider">Bitrate</span>
            </div>
            <p className="text-sm font-mono font-bold text-white">{(telemetry.bitrate / 1000).toFixed(1)}<span className="text-[10px] text-slate-400 ml-0.5">Mbps</span></p>
          </div>
          <div className="bg-slate-800/40 rounded-lg px-2.5 py-2">
            <div className="flex items-center gap-1 mb-1">
              <Activity className="w-3 h-3 text-amber-400" />
              <span className="text-[9px] text-slate-500 uppercase tracking-wider">Loss</span>
            </div>
            <p className="text-sm font-mono font-bold text-white">{telemetry.packetLoss}<span className="text-[10px] text-slate-400 ml-0.5">%</span></p>
          </div>
        </div>
      )}
    </div>
  );
}
