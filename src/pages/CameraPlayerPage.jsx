import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  Maximize2,
  Volume2,
  VolumeX,
  Video,
  ImageIcon,
  Move,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Home,
  Bookmark,
  Plus,
  Crosshair,
  Gauge,
  Square,
  Loader2,
  Target,
  AlertTriangle,
  Keyboard,
  Pencil,
  Trash2,
  Check,
  X,
  ArrowDownUp,
  Play,
  CircleStop,
  RotateCw,
  FlipHorizontal2,
} from 'lucide-react';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import TelemetryBadge from '../components/TelemetryBadge';
import HlsPlayer from '../components/HlsPlayer';
import { events as allEvents } from '../data/events';
import { formatTime } from '../utils/helpers';
import { usePTZ } from '../hooks/usePTZ';
import { usePTZKeyboard } from '../hooks/usePTZKeyboard';
import { useTelemetry } from '../hooks/useTelemetry';
import { ptzUtils } from '../services/ptzService';
import { cameraDiscoveryService } from '../services/cameraDiscoveryService';
import { GATEWAY_BASE } from '../config';
import { cameraStore, useCameraStore } from '../stores/cameraStore';
import PTZMiniPanel from '../components/PTZMiniPanel';

function DPadButton({ direction, icon, disabled, activeDirection, onStart, onStop, nearEdge }) {
  const IconComponent = icon;
  const isNear = nearEdge && (
    (direction === 'up' && nearEdge.tiltNear) ||
    (direction === 'down' && nearEdge.tiltNear) ||
    (direction === 'left' && nearEdge.panNear) ||
    (direction === 'right' && nearEdge.panNear)
  );
  return (
    <button
      onMouseDown={() => !disabled && onStart(direction)}
      onMouseUp={onStop}
      onMouseLeave={onStop}
      onTouchStart={() => !disabled && onStart(direction)}
      onTouchEnd={onStop}
      disabled={disabled}
      className={`p-2.5 rounded-lg transition-all duration-100 select-none ${
        activeDirection === direction
          ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 scale-90 shadow-[inset_0_2px_8px_rgba(0,0,0,0.3)]'
          : disabled
          ? 'bg-slate-800/30 text-slate-600 cursor-not-allowed'
          : isNear
          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 active:scale-90'
          : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 hover:text-white active:scale-90 border border-transparent hover:border-slate-600/50'
      }`}
    >
      <IconComponent className="w-5 h-5" />
    </button>
  );
}

export default function CameraPlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { cameras, loading } = useCameraStore();
  const camera = useMemo(() => cameras.find((c) => c.id === id) || null, [cameras, id]);
  const [muted, setMuted] = useState(true);
  const [recording, setRecording] = useState(false);
  const [precisionMode, setPrecisionMode] = useState(false);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [renamingPreset, setRenamingPreset] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingPreset, setDeletingPreset] = useState(null);
  const [presetSortAsc, setPresetSortAsc] = useState(true);
  const [showKeyboardHint, setShowKeyboardHint] = useState(false);
  const [streamState, setStreamState] = useState('stopped'); // stopped | starting | running | error
  const [streamHlsUrl, setStreamHlsUrl] = useState(null);
  const [streamError, setStreamError] = useState(null);
  const [rotation, setRotation] = useState(() => {
    try { return parseInt(localStorage.getItem(`cam-rot-${id}`)) || 0; } catch { return 0; }
  });
  const [mirrored, setMirrored] = useState(() => {
    try { return localStorage.getItem(`cam-mir-${id}`) === '1'; } catch { return false; }
  });
  const [showPtzOverlay, setShowPtzOverlay] = useState(false);
  const [enablePtzLoading, setEnablePtzLoading] = useState(false);
  const [enablePtzError, setEnablePtzError] = useState(null);
  const cycleRotation = () => {
    const next = (rotation + 90) % 360;
    setRotation(next);
    localStorage.setItem(`cam-rot-${id}`, String(next));
  };
  const toggleMirror = () => {
    const next = !mirrored;
    setMirrored(next);
    localStorage.setItem(`cam-mir-${id}`, next ? '1' : '0');
  };
  const videoTransform = [
    rotation ? `rotate(${rotation}deg)` : '',
    mirrored ? 'scaleX(-1)' : '',
  ].filter(Boolean).join(' ') || 'none';
  const is90 = rotation === 90 || rotation === 270;
  const cameraEvents = allEvents.filter((e) => e.cameraId === id).slice(0, 6);

  const ptz = usePTZ(id, camera);
  const telemetry = useTelemetry(id);

  const handleEnableCloseLiPtz = useCallback(async () => {
    if (!camera) return;
    setEnablePtzError(null);
    setEnablePtzLoading(true);
    try {
      const port = camera.port || 8080;
      await cameraStore.updateCamera(camera.id, {
        ptzSupported: true,
        zoomSupported: true,
        ptzType: 'http_cgi',
        httpCgi: { templateName: 'hi3510', baseUrl: `http://${camera.ip}:${port}` },
        movementSpeed: camera.movementSpeed || 5,
        maxZoom: camera.maxZoom || 5,
        panRange: Array.isArray(camera.panRange) && camera.panRange.length === 2 ? camera.panRange : [-180, 180],
        tiltRange: Array.isArray(camera.tiltRange) && camera.tiltRange.length === 2 ? camera.tiltRange : [-90, 45],
      });
    } catch (err) {
      setEnablePtzError(err?.message || 'Failed to enable PTZ');
    } finally {
      setEnablePtzLoading(false);
    }
  }, [camera]);

  const handleStartStream = useCallback(async () => {
    setStreamState('starting');
    setStreamError(null);
    try {
      // Stop existing TCP stream first, then start HD recording stream
      await cameraDiscoveryService.apiStopStream(id).catch(() => {});
      const result = await cameraDiscoveryService.apiStartStream(id, 'hd');
      if (result.success && result.stream) {
        setStreamHlsUrl(`${GATEWAY_BASE}${result.stream.hlsUrl}`);
        setStreamState(result.stream.state === 'running' ? 'running' : 'starting');
      } else {
        setStreamState('error');
        setStreamError(result.message || 'Failed to start stream');
      }
    } catch {
      setStreamState('error');
      setStreamError('Cannot reach stream gateway');
    }
  }, [id]);

  const handleStopStream = useCallback(async () => {
    try {
      await cameraDiscoveryService.apiStopStream(id);
    } catch { /* ignore */ }
    setStreamState('stopped');
    setStreamHlsUrl(null);
    setStreamError(null);
  }, [id]);

  // Auto-start stream when page loads and camera is online
  useEffect(() => {
    if (camera && camera.status !== 'offline' && streamState === 'stopped') {
      const t = setTimeout(handleStartStream, 0);
      return () => clearTimeout(t);
    }
  }, [camera?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll stream status while starting
  useEffect(() => {
    if (streamState !== 'starting') return;
    const interval = setInterval(async () => {
      try {
        const status = await cameraDiscoveryService.apiStreamStatus(id);
        if (status.state === 'running') {
          setStreamState('running');
          if (status.hlsUrl) setStreamHlsUrl(`${GATEWAY_BASE}${status.hlsUrl}`);
        } else if (status.state === 'error') {
          setStreamState('error');
          setStreamError(status.error || 'Stream failed');
        }
      } catch { /* ignore */ }
    }, 1500);
    return () => clearInterval(interval);
  }, [streamState, id]);

  usePTZKeyboard(ptz, camera?.ptzSupported || camera?.zoomSupported);

  const nearEdge = useMemo(() => {
    if (!camera || !camera.ptzSupported) return null;
    return ptzUtils.isNearEdge(ptz.position.pan, ptz.position.tilt, camera.panRange, camera.tiltRange);
  }, [ptz.position.pan, ptz.position.tilt, camera]);

  const edgeFactor = useMemo(() => {
    if (!camera || !camera.ptzSupported) return 1;
    return ptzUtils.getEdgeSlowdownFactor(ptz.position.pan, ptz.position.tilt, camera.panRange, camera.tiltRange);
  }, [ptz.position.pan, ptz.position.tilt, camera]);

  const effectiveSpeed = precisionMode ? Math.min(ptz.speed, 3) : ptz.speed;

  const sortedPresets = useMemo(() => {
    if (!camera || !camera.presets) return [];
    const sorted = [...camera.presets];
    sorted.sort((a, b) => presetSortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
    return sorted;
  }, [camera, presetSortAsc]);

  if (!camera) {
    return (
      <>
        <Header title="Camera Not Found" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-slate-400 mb-4">{loading ? 'Loading cameras…' : 'Camera not found'}</p>
            <button onClick={() => navigate('/cameras')} className="text-cyan-400 hover:text-cyan-300 text-sm font-medium">
              Back to Cameras
            </button>
          </div>
        </div>
      </>
    );
  }

  const handleStartMove = (direction) => {
    if (precisionMode) {
      ptz.move(direction);
    } else {
      ptz.startContinuousMove(direction);
    }
  };

  const handleStopMove = () => {
    if (!precisionMode) {
      ptz.stopContinuousMove();
    }
  };

  return (
    <>
      <Header title={camera.name} subtitle={camera.location} />
      <div className="flex-1 p-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
          <div className="xl:col-span-3 space-y-4">
            <div className="relative aspect-video bg-slate-900/80 border border-slate-800/50 rounded-xl overflow-hidden group">
              {streamState === 'running' && streamHlsUrl ? (
                <div className="w-full h-full overflow-hidden flex items-center justify-center">
                  <div style={{ transform: videoTransform, transformOrigin: 'center center' }} className={is90 ? 'w-full h-full scale-[0.56]' : 'w-full h-full'}>
                    <HlsPlayer hlsUrl={streamHlsUrl} autoplay muted={muted} />
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  {camera.status === 'offline' ? (
                    <div className="text-center">
                      <Camera className="w-16 h-16 text-slate-700 mx-auto mb-3" />
                      <p className="text-sm text-slate-500 font-medium">Camera Offline</p>
                      <p className="text-xs text-slate-600 mt-1">Last seen: {camera.uptime}</p>
                    </div>
                  ) : streamState === 'starting' ? (
                    <div className="text-center">
                      <Loader2 className="w-10 h-10 text-cyan-400 mx-auto mb-3 animate-spin" />
                      <p className="text-sm text-cyan-400 font-medium">Starting Stream...</p>
                      <p className="text-xs text-slate-500 mt-1">Converting RTSP → HLS</p>
                    </div>
                  ) : streamState === 'error' ? (
                    <div className="text-center">
                      <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                      <p className="text-sm text-red-400 font-medium">Stream Error</p>
                      <p className="text-xs text-slate-500 mt-1 max-w-xs">{streamError || 'Unknown error'}</p>
                      <button
                        onClick={handleStartStream}
                        className="mt-3 px-4 py-2 rounded-lg text-xs font-medium bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 hover:bg-cyan-500/25 transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Video className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                      <p className="text-sm text-slate-500 font-medium">Live Stream</p>
                      <p className="text-xs text-slate-600 mt-1">{camera.resolution} • {camera.fps}fps • {camera.codec}</p>
                      <button
                        onClick={handleStartStream}
                        className="mt-4 flex items-center gap-2 mx-auto px-5 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-400 hover:to-blue-400 transition-all shadow-lg shadow-cyan-500/20"
                      >
                        <Play className="w-4 h-4" />
                        Start Stream
                      </button>
                    </div>
                  )}
                </div>
              )}

              {camera.status !== 'offline' && (
                <>
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-900/10 via-transparent to-slate-900/30">
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
                  </div>

                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <StatusBadge status={camera.status} />
                    {recording && (
                      <div className="flex items-center gap-1 bg-red-500/20 backdrop-blur-sm border border-red-500/30 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse-dot" />
                        <span className="text-[10px] font-semibold text-red-400">REC</span>
                      </div>
                    )}
                    {camera.ptzSupported && (
                      <div className="flex items-center gap-1 bg-cyan-500/10 backdrop-blur-sm border border-cyan-500/20 px-2 py-0.5 rounded-full">
                        <Move className="w-3 h-3 text-cyan-400" />
                        <span className="text-[10px] font-semibold text-cyan-400">PTZ</span>
                      </div>
                    )}
                    {precisionMode && (
                      <div className="flex items-center gap-1 bg-violet-500/15 backdrop-blur-sm border border-violet-500/25 px-2 py-0.5 rounded-full">
                        <Target className="w-3 h-3 text-violet-400" />
                        <span className="text-[10px] font-semibold text-violet-400">PRECISION</span>
                      </div>
                    )}
                  </div>

                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    {nearEdge && (nearEdge.panNear || nearEdge.tiltNear) && (
                      <div className="flex items-center gap-1 bg-amber-500/12 backdrop-blur-sm border border-amber-500/25 px-2 py-0.5 rounded-full">
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        <span className="text-[10px] font-semibold text-amber-400">LIMIT</span>
                      </div>
                    )}
                    {ptz.isMoving && (
                      <div className="flex items-center gap-1 bg-amber-500/15 backdrop-blur-sm border border-amber-500/25 px-2 py-0.5 rounded-full">
                        <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                        <span className="text-[10px] font-semibold text-amber-400">MOVING</span>
                      </div>
                    )}
                    {telemetry && (
                      <div className="bg-slate-900/60 backdrop-blur-sm px-2 py-0.5 rounded-lg">
                        <TelemetryBadge telemetry={telemetry} compact />
                      </div>
                    )}
                    <div className="text-xs text-slate-400 bg-slate-900/60 backdrop-blur-sm px-2.5 py-1 rounded-lg font-mono">
                      {new Date().toLocaleTimeString('en-US', { hour12: false })}
                    </div>
                  </div>

                  <div className="absolute bottom-12 left-3 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-slate-900/70 backdrop-blur-sm px-2.5 py-1.5 rounded-lg text-[10px] font-mono text-slate-400 space-y-0.5">
                      <div>{ptzUtils.formatPosition(ptz.position.pan, ptz.position.tilt)}</div>
                      <div>Z: {ptzUtils.formatZoom(ptz.zoom)}</div>
                      {edgeFactor < 1 && (
                        <div className="text-amber-400">Slowdown: {Math.round(edgeFactor * 100)}%</div>
                      )}
                    </div>
                  </div>

                  {camera.ptzSupported && showPtzOverlay && (
                    <PTZMiniPanel
                      camera={camera}
                      onClose={() => setShowPtzOverlay(false)}
                      style={{ right: 12, bottom: 88 }}
                    />
                  )}
                </>
              )}

              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950/90 to-transparent pt-10 pb-3 px-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setRecording(!recording)}
                      className={`p-2 rounded-lg transition-colors ${
                        recording
                          ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                          : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
                      }`}
                      title={recording ? 'Stop Recording' : 'Start Recording'}
                    >
                      <Video className="w-4 h-4" />
                    </button>
                    <button
                      className="p-2 rounded-lg bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 transition-colors"
                      title="Snapshot"
                    >
                      <ImageIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setMuted(!muted)}
                      className="p-2 rounded-lg bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 transition-colors"
                      title={muted ? 'Unmute' : 'Mute'}
                    >
                      {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={cycleRotation}
                      className="p-2 rounded-lg bg-slate-800/60 text-slate-300 hover:text-cyan-400 hover:bg-slate-700/60 transition-colors"
                      title={`סובב (${rotation}°)`}
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={toggleMirror}
                      className={`p-2 rounded-lg transition-colors ${
                        mirrored
                          ? 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'
                          : 'bg-slate-800/60 text-slate-300 hover:text-cyan-400 hover:bg-slate-700/60'
                      }`}
                      title={mirrored ? 'בטל שיקוף' : 'שיקוף'}
                    >
                      <FlipHorizontal2 className="w-4 h-4" />
                    </button>
                    {camera.ptzSupported && (
                      <button
                        onClick={() => setShowPtzOverlay((v) => !v)}
                        className={`p-2 rounded-lg transition-colors ${
                          showPtzOverlay
                            ? 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'
                            : 'bg-slate-800/60 text-slate-300 hover:text-cyan-400 hover:bg-slate-700/60'
                        }`}
                        title={showPtzOverlay ? 'Hide PTZ' : 'Show PTZ'}
                      >
                        <Move className="w-4 h-4" />
                      </button>
                    )}
                    <div className="w-px h-5 bg-slate-700/50" />
                    {streamState === 'running' ? (
                      <button
                        onClick={handleStopStream}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25 transition-colors"
                        title="Stop Stream"
                      >
                        <CircleStop className="w-3.5 h-3.5" />
                        Stop
                      </button>
                    ) : streamState === 'starting' ? (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Starting...
                      </div>
                    ) : (
                      <button
                        onClick={handleStartStream}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 hover:bg-cyan-500/25 transition-colors"
                        title="Start Stream"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Stream
                      </button>
                    )}
                  </div>
                  <button
                    className="p-2 rounded-lg bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 transition-colors"
                    title="Fullscreen"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800/50 rounded-xl px-4 py-2">
              <span className="text-xs text-slate-400 font-medium mr-1">סיבוב:</span>
              <button
                onClick={cycleRotation}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/80 text-slate-300 hover:text-cyan-400 hover:bg-slate-700/80 border border-slate-700/50 transition-colors"
                title={`סובב (${rotation}°)`}
              >
                <RotateCw className="w-4 h-4" />
                <span>{rotation}°</span>
              </button>
              <button
                onClick={toggleMirror}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  mirrored
                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 hover:bg-cyan-500/30'
                    : 'bg-slate-800/80 text-slate-300 border-slate-700/50 hover:text-cyan-400 hover:bg-slate-700/80'
                }`}
                title={mirrored ? 'בטל שיקוף' : 'שיקוף'}
              >
                <FlipHorizontal2 className="w-4 h-4" />
                <span>{mirrored ? 'שיקוף פעיל' : 'שיקוף'}</span>
              </button>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Timeline</h3>
              <div className="relative h-10 bg-slate-800/60 rounded-lg overflow-hidden">
                <div className="absolute inset-y-0 left-0 w-[65%] bg-gradient-to-r from-blue-500/30 to-blue-500/10 rounded-lg" />
                <div className="absolute inset-y-0 left-[20%] w-[8%] bg-amber-500/30 rounded" />
                <div className="absolute inset-y-0 left-[45%] w-[3%] bg-red-500/30 rounded" />
                <div className="absolute inset-y-0 left-[65%] w-px bg-cyan-400" />
                <div className="absolute top-0 left-[65%] -translate-x-1/2 bg-cyan-400 text-[9px] text-slate-950 font-bold px-1.5 py-0.5 rounded-b">
                  NOW
                </div>
                <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 text-[9px] text-slate-600 font-mono">
                  <span>00:00</span>
                  <span>06:00</span>
                  <span>12:00</span>
                  <span>18:00</span>
                  <span>23:59</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800/40">
                <h3 className="text-sm font-semibold text-white mb-2">Camera Info</h3>
                <TelemetryBadge telemetry={telemetry} showDetails />
              </div>
              <div className="p-4 space-y-3">
                {[
                  ['Name', camera.name],
                  ['Type', camera.type],
                  ['IP', `${camera.ip}:${camera.port}`],
                  ['Resolution', camera.resolution],
                  ['FPS', `${camera.fps} fps`],
                  ['Codec', camera.codec],
                  ['Uptime', camera.uptime],
                  ['Group', camera.group],
                  ['PTZ', camera.ptzSupported ? 'Supported' : 'N/A'],
                  ['Zoom', camera.zoomSupported ? `Up to ${camera.maxZoom}x` : 'N/A'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">{label}</span>
                    <span className="text-xs text-slate-300 font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800/40 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Move className="w-4 h-4 text-cyan-400" />
                  PTZ Control
                </h3>
                <div className="flex items-center gap-2">
                  {ptz.ptzSupported && (
                    <>
                      <button
                        onClick={() => setShowKeyboardHint((v) => !v)}
                        className={`p-1 rounded-md transition-colors ${
                          showKeyboardHint ? 'text-cyan-400 bg-cyan-400/10' : 'text-slate-500 hover:text-slate-300'
                        }`}
                        title="Keyboard shortcuts"
                      >
                        <Keyboard className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setPrecisionMode((v) => !v)}
                        className={`p-1 rounded-md transition-colors ${
                          precisionMode
                            ? 'text-violet-400 bg-violet-400/10 border border-violet-500/30'
                            : 'text-slate-500 hover:text-slate-300 border border-transparent'
                        }`}
                        title={precisionMode ? 'Switch to Normal Mode' : 'Switch to Precision Mode'}
                      >
                        <Target className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  {ptz.ptzSupported && (
                    <div className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                      <Crosshair className="w-3 h-3" />
                      {ptzUtils.formatPosition(ptz.position.pan, ptz.position.tilt)}
                    </div>
                  )}
                </div>
              </div>

              {showKeyboardHint && (
                <div className="px-4 py-2.5 border-b border-slate-800/40 bg-slate-800/20">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                    <div className="flex justify-between"><span className="text-slate-500">Move</span><span className="text-slate-300 font-mono">WASD / Arrows</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Zoom</span><span className="text-slate-300 font-mono">+ / -</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Stop</span><span className="text-slate-300 font-mono">Space</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Home</span><span className="text-slate-300 font-mono">H</span></div>
                  </div>
                </div>
              )}

              <div className="p-4">
                {!ptz.ptzSupported && !ptz.zoomSupported ? (
                  <div className="text-center py-4">
                    <Move className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">PTZ not available for this camera</p>
                    {camera.brand === 'CloseLi' && (
                      <div className="mt-3">
                        <button
                          onClick={handleEnableCloseLiPtz}
                          disabled={enablePtzLoading}
                          className="px-3 py-2 rounded-lg text-xs font-medium bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 hover:bg-cyan-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {enablePtzLoading ? 'Enabling PTZ...' : 'Enable PTZ Control'}
                        </button>
                        {enablePtzError && (
                          <div className="mt-2 text-[10px] text-red-400">{enablePtzError}</div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {ptz.ptzSupported && (
                      <div className="flex flex-col items-center">
                        <div className="relative">
                          {nearEdge && (nearEdge.panNear || nearEdge.tiltNear) && (
                            <div className="absolute -inset-2 rounded-2xl border border-amber-500/20 animate-pulse pointer-events-none" />
                          )}
                          <div className="grid grid-cols-3 gap-1 w-fit">
                            <div />
                            <DPadButton direction="up" icon={ChevronUp} disabled={!ptz.ptzSupported} activeDirection={ptz.activeDirection} onStart={handleStartMove} onStop={handleStopMove} nearEdge={nearEdge} />
                            <div />
                            <DPadButton direction="left" icon={ChevronLeft} disabled={!ptz.ptzSupported} activeDirection={ptz.activeDirection} onStart={handleStartMove} onStop={handleStopMove} nearEdge={nearEdge} />
                            <button
                              onClick={ptz.isMoving ? ptz.stop : ptz.goHome}
                              className={`p-2.5 rounded-lg border transition-all duration-100 active:scale-90 ${
                                ptz.isMoving
                                  ? 'bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/25'
                                  : ptzUtils.isAtHome(ptz.position.pan, ptz.position.tilt, ptz.zoom)
                                  ? 'bg-slate-800/40 border-slate-700/30 text-slate-500'
                                  : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20'
                              }`}
                              title={ptz.isMoving ? 'Stop (Space)' : 'Home (H)'}
                            >
                              {ptz.isMoving ? <Square className="w-4 h-4" /> : <Home className="w-4 h-4" />}
                            </button>
                            <DPadButton direction="right" icon={ChevronRight} disabled={!ptz.ptzSupported} activeDirection={ptz.activeDirection} onStart={handleStartMove} onStop={handleStopMove} nearEdge={nearEdge} />
                            <div />
                            <DPadButton direction="down" icon={ChevronDown} disabled={!ptz.ptzSupported} activeDirection={ptz.activeDirection} onStart={handleStartMove} onStop={handleStopMove} nearEdge={nearEdge} />
                            <div />
                          </div>
                        </div>
                        {precisionMode && (
                          <div className="mt-2 text-[9px] text-violet-400 flex items-center gap-1">
                            <Target className="w-3 h-3" />
                            Precision — step mode, speed capped at {effectiveSpeed}
                          </div>
                        )}
                      </div>
                    )}

                    {camera.ptzSupported && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Range</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`absolute inset-y-0 rounded-full transition-all duration-200 ${nearEdge?.panNear ? 'bg-amber-500/60' : 'bg-slate-600/60'}`}
                              style={{
                                left: `${((ptz.position.pan - camera.panRange[0]) / (camera.panRange[1] - camera.panRange[0])) * 100}%`,
                                width: '4px',
                              }}
                            />
                          </div>
                          <div className="relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`absolute inset-y-0 rounded-full transition-all duration-200 ${nearEdge?.tiltNear ? 'bg-amber-500/60' : 'bg-slate-600/60'}`}
                              style={{
                                left: `${((ptz.position.tilt - camera.tiltRange[0]) / (camera.tiltRange[1] - camera.tiltRange[0])) * 100}%`,
                                width: '4px',
                              }}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-0.5">
                          <div className="flex justify-between text-[8px] text-slate-600 font-mono">
                            <span>Pan {camera.panRange[0]}°</span>
                            <span>{camera.panRange[1]}°</span>
                          </div>
                          <div className="flex justify-between text-[8px] text-slate-600 font-mono">
                            <span>Tilt {camera.tiltRange[0]}°</span>
                            <span>{camera.tiltRange[1]}°</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {ptz.zoomSupported && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Zoom</span>
                          <span className="text-xs font-mono text-cyan-400">{ptzUtils.formatZoom(ptz.zoom)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={ptz.zoomOut}
                            disabled={ptz.zoom <= 1.0}
                            className="p-1.5 rounded-md bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 hover:text-white transition-all duration-100 active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ZoomOut className="w-3.5 h-3.5" />
                          </button>
                          <div className="flex-1 relative h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500/60 to-cyan-400/80 rounded-full transition-all duration-200"
                              style={{ width: `${((ptz.zoom - 1) / (ptz.maxZoom - 1)) * 100}%` }}
                            />
                            <input
                              type="range"
                              min={1}
                              max={ptz.maxZoom}
                              step={0.5}
                              value={ptz.zoom}
                              onChange={(e) => ptz.setZoomLevel(parseFloat(e.target.value))}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                          </div>
                          <button
                            onClick={ptz.zoomIn}
                            disabled={ptz.zoom >= ptz.maxZoom}
                            className="p-1.5 rounded-md bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 hover:text-white transition-all duration-100 active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ZoomIn className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-600 mt-1 px-6">
                          <span>1x</span>
                          <span>{ptz.maxZoom}x</span>
                        </div>
                      </div>
                    )}

                    {ptz.ptzSupported && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <Gauge className="w-3 h-3" />
                            Speed {precisionMode && <span className="text-violet-400">(capped)</span>}
                          </span>
                          <span className="text-xs font-mono text-slate-400">{effectiveSpeed}/10</span>
                        </div>
                        <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-200 ${
                              precisionMode ? 'bg-gradient-to-r from-violet-500/50 to-violet-400/70' : 'bg-gradient-to-r from-blue-500/50 to-blue-400/70'
                            }`}
                            style={{ width: `${(effectiveSpeed / 10) * 100}%` }}
                          />
                          <input
                            type="range"
                            min={1}
                            max={precisionMode ? 3 : 10}
                            step={1}
                            value={effectiveSpeed}
                            onChange={(e) => ptz.changeSpeed(parseInt(e.target.value))}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-600 mt-1">
                          <span>Slow</span>
                          <span>{precisionMode ? 'Precision Max' : 'Fast'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {camera.ptzSupported && camera.presets && camera.presets.length > 0 && (
              <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800/40 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Bookmark className="w-4 h-4 text-cyan-400" />
                    Presets
                    <span className="text-[10px] text-slate-500 font-normal">({sortedPresets.length})</span>
                  </h3>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPresetSortAsc((v) => !v)}
                      className="p-1 rounded-md text-slate-500 hover:text-slate-300 transition-colors"
                      title={presetSortAsc ? 'Sort Z-A' : 'Sort A-Z'}
                    >
                      <ArrowDownUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setShowSavePreset(!showSavePreset)}
                      className="p-1 rounded-md text-slate-400 hover:text-cyan-400 hover:bg-cyan-400/10 transition-colors"
                      title="Save current position as preset"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="p-2">
                  {showSavePreset && (
                    <div className="flex items-center gap-2 px-2 py-2 mb-1">
                      <input
                        type="text"
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        placeholder="Preset name..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newPresetName.trim()) {
                            ptz.savePreset(newPresetName.trim());
                            setNewPresetName('');
                            setShowSavePreset(false);
                          }
                        }}
                        className="flex-1 px-2 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-md text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                      />
                      <button
                        onClick={async () => {
                          if (newPresetName.trim()) {
                            await ptz.savePreset(newPresetName.trim());
                            setNewPresetName('');
                            setShowSavePreset(false);
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 hover:bg-cyan-500/25 transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {sortedPresets.map((preset) => (
                      <div key={preset.id} className="group/preset">
                        {deletingPreset === preset.id ? (
                          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
                            <span className="text-xs text-red-400">Delete &ldquo;{preset.name}&rdquo;?</span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { ptz.savePreset('__delete__'); setDeletingPreset(null); }}
                                className="p-1 rounded text-red-400 hover:bg-red-500/20 transition-colors"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeletingPreset(null)}
                                className="p-1 rounded text-slate-400 hover:bg-slate-700/50 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : renamingPreset === preset.id ? (
                          <div className="flex items-center gap-2 px-3 py-2">
                            <input
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && renameValue.trim()) {
                                  setRenamingPreset(null);
                                }
                                if (e.key === 'Escape') setRenamingPreset(null);
                              }}
                              autoFocus
                              className="flex-1 px-2 py-1 bg-slate-800/60 border border-cyan-500/40 rounded text-xs text-white focus:outline-none"
                            />
                            <button
                              onClick={() => setRenamingPreset(null)}
                              className="p-1 rounded text-cyan-400 hover:bg-cyan-400/10 transition-colors"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-800/50 transition-colors">
                            <button
                              onClick={() => ptz.goToPreset(preset)}
                              className="flex items-center gap-2.5 flex-1 text-left"
                            >
                              <div className="w-6 h-6 rounded-md bg-slate-800/80 flex items-center justify-center group-hover/preset:bg-cyan-500/15 transition-colors">
                                <Crosshair className="w-3 h-3 text-slate-500 group-hover/preset:text-cyan-400 transition-colors" />
                              </div>
                              <div>
                                <p className="text-xs font-medium text-slate-300 group-hover/preset:text-white transition-colors">{preset.name}</p>
                                <p className="text-[10px] text-slate-600">
                                  P:{preset.pan}° T:{preset.tilt}° Z:{preset.zoom}x
                                </p>
                              </div>
                            </button>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover/preset:opacity-100 transition-opacity">
                              <button
                                onClick={() => { setRenamingPreset(preset.id); setRenameValue(preset.name); }}
                                className="p-1 rounded text-slate-500 hover:text-cyan-400 transition-colors"
                                title="Rename"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => ptz.goToPreset({ ...preset, pan: 0, tilt: 0, zoom: 1 })}
                                className="p-1 rounded text-slate-500 hover:text-cyan-400 transition-colors"
                                title="Set as Home"
                              >
                                <Home className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => setDeletingPreset(preset.id)}
                                className="p-1 rounded text-slate-500 hover:text-red-400 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Recent Events</h3>
              {cameraEvents.length > 0 ? (
                <div className="space-y-2">
                  {cameraEvents.map((evt) => (
                    <div key={evt.id} className="flex items-start gap-2 py-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                          evt.severity === 'critical' ? 'bg-red-400' : evt.severity === 'warning' ? 'bg-amber-400' : 'bg-blue-400'
                        }`}
                      />
                      <div>
                        <p className="text-xs text-slate-300">{evt.message}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{formatTime(evt.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No recent events</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
