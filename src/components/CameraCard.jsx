import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Wifi, WifiOff, Maximize2, Move, Loader2, Circle, Square, RotateCw, FlipHorizontal2 } from 'lucide-react';
import StatusBadge from './StatusBadge';
import TelemetryBadge from './TelemetryBadge';
import PTZMiniPanel from './PTZMiniPanel';
import HlsPlayer from './HlsPlayer';
import { useTelemetry } from '../hooks/useTelemetry';
import { GATEWAY_BASE } from '../config';

export default function CameraCard({ camera, compact = false, fillHeight = false, streamMode = 'hd' }) {
  const navigate = useNavigate();
  const telemetry = useTelemetry(camera.id);
  const [showMiniPTZ, setShowMiniPTZ] = useState(false);
  const [hlsUrl, setHlsUrl] = useState(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recLoading, setRecLoading] = useState(false);
  const lastStreamModeRef = useRef(null);
  const [rotation, setRotation] = useState(() => {
    try { return parseInt(localStorage.getItem(`cam-rot-${camera.id}`)) || 0; } catch { return 0; }
  });
  const [mirrored, setMirrored] = useState(() => {
    try { return localStorage.getItem(`cam-mir-${camera.id}`) === '1'; } catch { return false; }
  });

  const cycleRotation = (e) => {
    e.stopPropagation();
    const next = (rotation + 90) % 360;
    setRotation(next);
    localStorage.setItem(`cam-rot-${camera.id}`, String(next));
  };
  const toggleMirror = (e) => {
    e.stopPropagation();
    const next = !mirrored;
    setMirrored(next);
    localStorage.setItem(`cam-mir-${camera.id}`, next ? '1' : '0');
  };

  const videoTransform = [
    rotation ? `rotate(${rotation}deg)` : '',
    mirrored ? 'scaleX(-1)' : '',
  ].filter(Boolean).join(' ') || 'none';
  const is90 = rotation === 90 || rotation === 270;

  useEffect(() => {
    if (camera.status === 'offline') return;
    let cancelled = false;
    const controller = new AbortController();
    const shouldStopFirst = lastStreamModeRef.current != null && lastStreamModeRef.current !== streamMode;
    lastStreamModeRef.current = streamMode;
    const startStream = async () => {
      setStreamLoading(true);
      setHlsUrl(null);

      if (shouldStopFirst) {
        try {
          await fetch(`${GATEWAY_BASE}/api/streams/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cameraId: camera.id }),
            signal: controller.signal,
          });
        } catch { /* ignore */ }
      }

      // Step 1: tell backend to start the stream
      // Use streamMode from Dashboard toggle: 'hd' = recording (1600x960), 'live' = TCP (640x360)
      const mode = streamMode === 'hd' ? 'recording' : 'live';
      let hlsPath = null;
      for (let retry = 0; retry < 3 && !cancelled; retry++) {
        try {
          const res = await fetch(`${GATEWAY_BASE}/api/streams/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cameraId: camera.id, mode }),
            signal: controller.signal,
          });
          const data = await res.json();
          const url = data.hlsUrl || (data.stream && data.stream.hlsUrl);
          if (url) { hlsPath = url; break; }
          if (!data.success) await new Promise(r => setTimeout(r, 5000));
        } catch { await new Promise(r => setTimeout(r, 5000)); }
      }
      if (!hlsPath || cancelled) { if (!cancelled) setStreamLoading(false); return; }

      // Step 2: poll status until stream is 'running' (m3u8 ready)
      for (let poll = 0; poll < 30 && !cancelled; poll++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const statusRes = await fetch(`${GATEWAY_BASE}/api/streams/status/${camera.id}`, { signal: controller.signal });
          const status = await statusRes.json();
          if (status.state === 'running') {
            if (!cancelled) setHlsUrl(`${GATEWAY_BASE}${status.hlsUrl || hlsPath}`);
            break;
          }
          if (status.state === 'error') break;
        } catch { /* retry */ }
      }
      if (!cancelled) setStreamLoading(false);
    };
    startStream();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [camera.id, camera.status, streamMode]);

  const isLive = !!hlsUrl;

  const toggleRecording = async (e) => {
    e.stopPropagation();
    setRecLoading(true);
    try {
      const endpoint = isRecording ? 'stop' : 'start';
      const res = await fetch(`${GATEWAY_BASE}/api/recordings/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameraId: camera.id }),
      });
      const data = await res.json();
      if (data.success) {
        setIsRecording(!isRecording);
      }
    } catch { /* */ }
    setRecLoading(false);
  };

  return (
    <div
      onClick={() => navigate(`/camera/${camera.id}`)}
      className={`group relative bg-slate-900/60 border border-slate-800/50 rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/5 ${fillHeight ? 'flex flex-col h-full' : ''}`}
    >
      <div className={`relative bg-slate-800/80 overflow-hidden ${fillHeight ? 'flex-1 min-h-0' : 'aspect-video'}`}>
        {isLive ? (
          <div className="w-full h-full overflow-hidden flex items-center justify-center">
            <div style={{ transform: videoTransform, width: is90 ? '100%' : '100%', height: is90 ? '100%' : '100%', transformOrigin: 'center center', ...(is90 ? { aspectRatio: 'auto' } : {}) }} className={is90 ? 'scale-[0.56] sm:scale-75' : 'w-full h-full'}>
              <HlsPlayer hlsUrl={hlsUrl} autoplay muted />
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              {streamLoading ? (
                <Loader2 className="w-6 h-6 text-cyan-400 mx-auto mb-1 animate-spin" />
              ) : (
                <Video className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              )}
              {!compact && !streamLoading && (
                <p className="text-xs text-slate-600 font-medium">{camera.resolution} • {camera.fps}fps</p>
              )}
              {streamLoading && (
                <p className="text-[10px] text-cyan-400/70">מתחבר...</p>
              )}
            </div>
          </div>
        )}

        {!isLive && (camera.status === 'online' || camera.status === 'motion') ? (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/20 via-transparent to-slate-900/40 pointer-events-none">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
            <svg className="absolute inset-0 w-full h-full opacity-5" viewBox="0 0 100 100">
              <pattern id={`grid-${camera.id}`} width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
              <rect width="100" height="100" fill={`url(#grid-${camera.id})`} />
            </svg>
          </div>
        ) : !isLive && camera.status === 'offline' ? (
          <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center">
            <WifiOff className="w-10 h-10 text-red-500/40" />
          </div>
        ) : null}

        <div className="absolute top-1 sm:top-2 left-1 sm:left-2 right-1 sm:right-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <StatusBadge status={camera.status} />
            {camera.ptzSupported && !compact && (
              <div className="flex items-center gap-0.5 sm:gap-1 bg-cyan-500/10 backdrop-blur-sm border border-cyan-500/20 px-1 sm:px-1.5 py-0.5 rounded-full">
                <Move className="w-2 sm:w-2.5 h-2 sm:h-2.5 text-cyan-400" />
                <span className="text-[8px] sm:text-[9px] font-semibold text-cyan-400">PTZ</span>
              </div>
            )}
            {!compact && (
              <div className={`flex items-center gap-0.5 sm:gap-1 backdrop-blur-sm border px-1 sm:px-1.5 py-0.5 rounded-full ${
                streamMode === 'hd' 
                  ? 'bg-purple-500/10 border-purple-500/20' 
                  : 'bg-orange-500/10 border-orange-500/20'
              }`}>
                <span className={`text-[8px] sm:text-[9px] font-semibold ${
                  streamMode === 'hd' ? 'text-purple-400' : 'text-orange-400'
                }`}>
                  {streamMode === 'hd' ? 'HD' : 'LIVE'}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {!compact && telemetry && (
              <div className="bg-slate-900/60 backdrop-blur-sm px-1 sm:px-1.5 py-0.5 rounded-full">
                <TelemetryBadge telemetry={telemetry} compact />
              </div>
            )}
            {isRecording && (
              <div className="flex items-center gap-0.5 sm:gap-1 bg-red-500/20 backdrop-blur-sm border border-red-500/30 px-1.5 sm:px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse-dot" />
                <span className="text-[9px] sm:text-[10px] font-semibold text-red-400">REC</span>
              </div>
            )}
          </div>
        </div>

        <div className="absolute bottom-1 sm:bottom-2 right-1 sm:right-2 flex items-center gap-1 sm:gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={cycleRotation}
            className="p-0.5 sm:p-1 bg-slate-900/80 backdrop-blur-sm rounded-lg border border-slate-700/50 text-slate-300 hover:text-cyan-400 transition-colors"
            title={`סובב (${rotation}°)`}
          >
            <RotateCw className="w-2.5 sm:w-3 h-2.5 sm:h-3" />
          </button>
          <button
            onClick={toggleMirror}
            className={`p-1.5 backdrop-blur-sm rounded-lg border transition-colors ${
              mirrored
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
                : 'bg-slate-900/80 border-slate-700/50 text-slate-300 hover:text-cyan-400'
            }`}
            title={mirrored ? 'בטל שיקוף' : 'שיקוף'}
          >
            <FlipHorizontal2 className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
          </button>
          <button
            onClick={toggleRecording}
            disabled={recLoading}
            className={`p-1.5 backdrop-blur-sm rounded-lg border transition-colors ${
              isRecording
                ? 'bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30'
                : 'bg-slate-900/80 border-slate-700/50 text-slate-300 hover:text-red-400'
            }`}
            title={isRecording ? 'עצור הקלטה' : 'התחל הקלטה'}
          >
            {isRecording ? (
              <Square className="w-3 sm:w-3.5 h-3 sm:h-3.5 fill-current" />
            ) : (
              <Circle className="w-3 sm:w-3.5 h-3 sm:h-3.5 fill-red-500 text-red-500" />
            )}
          </button>
          {camera.ptzSupported && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMiniPTZ((v) => !v);
              }}
              className="p-1 sm:p-1.5 bg-cyan-500/15 backdrop-blur-sm rounded-lg border border-cyan-500/25 text-cyan-400 hover:bg-cyan-500/25 transition-colors"
              title="Quick PTZ Control"
            >
              <Move className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/camera/${camera.id}`);
            }}
            className="p-1 sm:p-1.5 bg-slate-900/80 backdrop-blur-sm rounded-lg border border-slate-700/50 text-slate-300 hover:text-white transition-colors"
          >
            <Maximize2 className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
          </button>
        </div>

        {!compact && (
          <div className="absolute bottom-1 sm:bottom-2 left-1 sm:left-2">
            <div className="flex items-center gap-0.5 sm:gap-1 bg-slate-900/70 backdrop-blur-sm px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] text-slate-400 font-mono">
              <Wifi className="w-2.5 sm:w-3 h-2.5 sm:h-3" />
              {camera.type}
            </div>
          </div>
        )}
      </div>

      <div className={fillHeight ? 'px-1.5 sm:px-2 py-0.5 sm:py-1 flex items-center justify-between flex-shrink-0' : 'p-2 sm:p-3'}>
        <h3 className={`${fillHeight ? 'text-xs' : 'text-sm'} font-semibold text-white truncate group-hover:text-cyan-400 transition-colors`}>
          {camera.name}
        </h3>
        {!compact && !fillHeight && (
          <div className="flex items-center justify-between mt-0.5">
            <p className="text-xs text-slate-500 truncate">{camera.location}</p>
            {telemetry && telemetry.connectionQuality !== 'offline' && (
              <span className="text-[10px] font-mono text-slate-500 flex-shrink-0 ml-2">{telemetry.rttMs}ms</span>
            )}
          </div>
        )}
        {fillHeight && (
          <p className="text-[10px] text-slate-500 truncate ml-2">{camera.location}</p>
        )}
      </div>

      {showMiniPTZ && camera.ptzSupported && (
        <PTZMiniPanel
          camera={camera}
          onClose={() => setShowMiniPTZ(false)}
          style={{ bottom: '100%', right: 8, marginBottom: 4 }}
        />
      )}
    </div>
  );
}
