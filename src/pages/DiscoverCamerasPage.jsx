import { useState, useCallback, useMemo } from 'react';
import {
  Radar,
  Loader2,
  Check,
  Plus,
  Move,
  Shield,
  Wifi,
  WifiOff,
  RefreshCw,
  MonitorSmartphone,
  Eye,
  EyeOff,
  X,
  Zap,
  Camera,
  Globe,
  Usb,
} from 'lucide-react';
import Header from '../components/Header';
import AddCameraModal from '../components/AddCameraModal';
import { cameraDiscoveryService } from '../services/cameraDiscoveryService';
import { cameraStore, useCameraStore } from '../stores/cameraStore';

export default function DiscoverCamerasPage() {
  const [activeTab, setActiveTab] = useState('mock');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState([]);
  const [hasScanned, setHasScanned] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [prefillCamera, setPrefillCamera] = useState(null);
  const [addingId, setAddingId] = useState(null);

  const { cameras: existingCameras } = useCameraStore();
  const existingIps = useMemo(() => new Set(existingCameras.map((c) => c.ip).filter(Boolean)), [existingCameras]);

  // Auto Discover tab state
  const [autoScanning, setAutoScanning] = useState(false);
  const [autoResult, setAutoResult] = useState(null);

  // ONVIF tab state
  const [onvifScanning, setOnvifScanning] = useState(false);
  const [onvifResults, setOnvifResults] = useState([]);
  const [onvifHasScanned, setOnvifHasScanned] = useState(false);
  const [onvifCredModal, setOnvifCredModal] = useState(null);
  const [onvifCreds, setOnvifCreds] = useState({ username: 'admin', password: '', name: '' });
  const [onvifAdding, setOnvifAdding] = useState(false);
  const [onvifError, setOnvifError] = useState(null);
  const [showOnvifPassword, setShowOnvifPassword] = useState(false);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setProgress(null);
    setResults([]);
    try {
      const cameras = await cameraDiscoveryService.scanLocalNetwork((p) => {
        setProgress(p);
      });
      setResults(cameras);
      setHasScanned(true);
    } finally {
      setScanning(false);
    }
  }, []);

  const handleAutoDiscover = useCallback(async () => {
    setAutoScanning(true);
    setAutoResult(null);
    try {
      const result = await cameraDiscoveryService.apiAutoDiscover();
      setAutoResult(result);
      await cameraStore.loadCameras();
    } catch {
      setAutoResult({ success: false, message: 'Scan failed — is the gateway running?' });
    } finally {
      setAutoScanning(false);
    }
  }, []);

  const handleOnvifScan = useCallback(async () => {
    setOnvifScanning(true);
    setOnvifResults([]);
    setOnvifError(null);
    try {
      const devices = await cameraDiscoveryService.apiOnvifScan(4000);
      setOnvifResults(devices);
      setOnvifHasScanned(true);
    } catch {
      setOnvifError('Scan failed — is the gateway running?');
    } finally {
      setOnvifScanning(false);
    }
  }, []);

  const handleOnvifAdd = useCallback(async () => {
    if (!onvifCredModal) return;
    setOnvifAdding(true);
    setOnvifError(null);
    try {
      const result = await cameraDiscoveryService.apiOnvifAdd({
        ip: onvifCredModal.ip,
        xaddr: onvifCredModal.xaddr,
        username: onvifCreds.username,
        password: onvifCreds.password,
        name: onvifCreds.name || onvifCredModal.name,
      });
      if (result.success) {
        await cameraStore.loadCameras();
        setOnvifCredModal(null);
        setOnvifCreds({ username: 'admin', password: '', name: '' });
      } else {
        setOnvifError(result.message || 'Failed to add camera');
      }
    } catch (err) {
      setOnvifError(err.message || 'Connection failed');
    } finally {
      setOnvifAdding(false);
    }
  }, [onvifCredModal, onvifCreds]);

  const handleQuickAdd = useCallback(async (camera) => {
    setAddingId(camera.id);
    await new Promise((r) => setTimeout(r, 400));
    try {
      await cameraStore.addCamera({
        name: camera.name,
        type: camera.onvifSupported ? 'ONVIF' : 'RTSP',
        ip: camera.ip,
        port: camera.port,
        rtspUrl: camera.rtspUrl || '',
        status: 'online',
        recording: false,
        resolution: '1920x1080',
        fps: 25,
        codec: 'H.264',
        location: '',
        group: 'Discovered',
        ptzSupported: camera.ptzSupported ?? false,
        zoomSupported: camera.zoomSupported ?? false,
        onvifSupported: camera.onvifSupported ?? false,
        brand: camera.brand || 'Unknown',
        model: camera.model || 'Unknown',
        ptzType: camera.onvifSupported && camera.ptzSupported ? 'onvif' : 'none',
      });
    } catch { /* ignore */ }
    setAddingId(null);
  }, []);

  const handleOpenAddModal = useCallback((camera) => {
    setPrefillCamera({
      name: camera.name,
      ip: camera.ip,
      port: String(camera.port),
      type: camera.onvifSupported ? 'ONVIF' : 'RTSP',
      rtspUrl: camera.rtspUrl,
      username: '',
      password: '',
      location: '',
      group: 'Discovered',
      ptzSupported: camera.ptzSupported,
      zoomSupported: camera.zoomSupported,
      onvifSupported: camera.onvifSupported,
      brand: camera.brand,
      model: camera.model,
    });
    setModalOpen(true);
  }, []);

  const handleManualAdd = useCallback(() => {
    setPrefillCamera(null);
    setModalOpen(true);
  }, []);

  const handleSaveCamera = useCallback(async (formData) => {
    try {
      await cameraStore.addCamera(formData);
    } catch { /* ignore */ }
  }, []);

  return (
    <>
      <Header title="Discover Cameras" subtitle="Scan your local network for IP cameras" />
      <div className="flex-1 p-6 space-y-6">
        {/* Tab Bar */}
        <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800/50 rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab('mock')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'mock'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/25'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <Radar className="w-3.5 h-3.5" />
              Port Scan
            </span>
          </button>
          <button
            onClick={() => setActiveTab('onvif')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'onvif'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" />
              ONVIF Scan
            </span>
          </button>
          <button
            onClick={() => setActiveTab('auto')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'auto'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" />
              Auto Discover
            </span>
          </button>
        </div>

        {activeTab === 'mock' && (
        <>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Radar className={`w-5 h-5 text-cyan-400 ${scanning ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Network Scanner</h2>
              <p className="text-xs text-slate-500">
                Scanning ports: {cameraDiscoveryService.SCAN_PORTS.join(', ')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleManualAdd}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-800 border border-slate-700/50 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Manually
            </button>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-400 hover:to-blue-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
            >
              {scanning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {scanning ? 'Scanning...' : 'Scan Network'}
            </button>
          </div>
        </div>

        {scanning && progress && (
          <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-5 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                <span className="text-sm text-slate-300">{progress.message}</span>
              </div>
              <span className="text-xs font-mono text-cyan-400">{Math.round(progress.progress)}%</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
            {progress.port && (
              <div className="flex items-center gap-4 mt-3">
                {cameraDiscoveryService.SCAN_PORTS.map((port) => (
                  <div key={port} className="flex items-center gap-1.5">
                    <div
                      className={`w-2 h-2 rounded-full transition-colors ${
                        port < progress.port
                          ? 'bg-emerald-400'
                          : port === progress.port
                          ? 'bg-cyan-400 animate-pulse'
                          : 'bg-slate-700'
                      }`}
                    />
                    <span className={`text-[10px] font-mono ${
                      port <= progress.port ? 'text-slate-300' : 'text-slate-600'
                    }`}>
                      :{port}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!hasScanned && !scanning && (
          <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-12 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto mb-4">
              <MonitorSmartphone className="w-8 h-8 text-slate-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-300 mb-2">No Scan Results</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
              Click &ldquo;Scan Network&rdquo; to discover IP cameras on your local network,
              or add a camera manually if you know its IP address.
            </p>
            <button
              onClick={handleScan}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-400 hover:to-blue-400 transition-all shadow-lg shadow-cyan-500/20"
            >
              <Radar className="w-4 h-4" />
              Start Discovery
            </button>
          </div>
        )}

        {hasScanned && !scanning && results.length === 0 && (
          <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-12 text-center animate-fade-in">
            <WifiOff className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-300 mb-2">No Cameras Found</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              No IP cameras were detected on the local network. Make sure cameras are powered on and connected.
            </p>
          </div>
        )}

        {results.length > 0 && !scanning && (
          <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl overflow-hidden animate-fade-in">
            <div className="px-5 py-3 border-b border-slate-800/40 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Wifi className="w-4 h-4 text-cyan-400" />
                Discovered Cameras
                <span className="text-xs font-normal text-slate-500">({results.length})</span>
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800/40">
                    {['Name', 'IP Address', 'Brand', 'Model', 'PTZ', 'ONVIF', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((cam) => {
                    const isAdded = existingIps.has(cam.ip);
                    const isAdding = addingId === cam.id;
                    return (
                      <tr
                        key={cam.id}
                        className={`border-b border-slate-800/20 transition-colors ${
                          isAdded ? 'bg-emerald-500/5' : 'hover:bg-slate-800/30'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-slate-800/60 flex items-center justify-center flex-shrink-0">
                              <MonitorSmartphone className="w-4 h-4 text-slate-400" />
                            </div>
                            <span className="text-sm font-medium text-white">{cam.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-slate-300">{cam.ip}:{cam.port}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-400">{cam.brand}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-400 font-mono">{cam.model}</span>
                        </td>
                        <td className="px-4 py-3">
                          {cam.ptzSupported ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded-full">
                              <Move className="w-2.5 h-2.5" />
                              PTZ
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {cam.onvifSupported ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                              <Shield className="w-2.5 h-2.5" />
                              ONVIF
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-400">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                            Discovered
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {isAdded ? (
                              <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                                <Check className="w-3.5 h-3.5" />
                                Added
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleQuickAdd(cam)}
                                  disabled={isAdding}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
                                >
                                  {isAdding ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Plus className="w-3 h-3" />
                                  )}
                                  Quick Add
                                </button>
                                <button
                                  onClick={() => handleOpenAddModal(cam)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 border border-slate-700/40 hover:text-white hover:border-slate-600 transition-colors"
                                >
                                  Configure
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>
        )}

        {/* ─── ONVIF Tab ─────────────────────────────────────── */}
        {activeTab === 'onvif' && (
        <>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Shield className={`w-5 h-5 text-emerald-400 ${onvifScanning ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">ONVIF Discovery</h2>
              <p className="text-xs text-slate-500">WS-Discovery probe on UDP 239.255.255.250:3702</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleManualAdd}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-800 border border-slate-700/50 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Manually
            </button>
            <button
              onClick={handleOnvifScan}
              disabled={onvifScanning}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-emerald-500 to-green-500 text-white hover:from-emerald-400 hover:to-green-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
            >
              {onvifScanning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Shield className="w-4 h-4" />
              )}
              {onvifScanning ? 'Scanning...' : 'ONVIF Scan'}
            </button>
          </div>
        </div>

        {onvifScanning && (
          <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-8 text-center animate-fade-in">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-300">Sending WS-Discovery probe...</p>
            <p className="text-xs text-slate-500 mt-1">Waiting for ONVIF devices to respond (4s timeout)</p>
          </div>
        )}

        {onvifError && !onvifScanning && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 text-center">
            <p className="text-sm text-red-400">{onvifError}</p>
          </div>
        )}

        {!onvifHasScanned && !onvifScanning && (
          <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-12 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-emerald-500/60" />
            </div>
            <h3 className="text-lg font-semibold text-slate-300 mb-2">Real ONVIF Discovery</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mb-2">
              Discovers ONVIF-compatible cameras on your network using WS-Discovery.
            </p>
            <p className="text-xs text-slate-600 max-w-sm mx-auto mb-6">
              Requires the gateway server to be running on port 5055.
            </p>
            <button
              onClick={handleOnvifScan}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium bg-gradient-to-r from-emerald-500 to-green-500 text-white hover:from-emerald-400 hover:to-green-400 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Shield className="w-4 h-4" />
              Start ONVIF Scan
            </button>
          </div>
        )}

        {onvifHasScanned && !onvifScanning && onvifResults.length === 0 && (
          <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-12 text-center animate-fade-in">
            <WifiOff className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-300 mb-2">No ONVIF Cameras Found</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              No ONVIF devices responded to WS-Discovery. Make sure cameras support ONVIF and are on the same subnet.
            </p>
          </div>
        )}

        {onvifResults.length > 0 && !onvifScanning && (
          <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl overflow-hidden animate-fade-in">
            <div className="px-5 py-3 border-b border-slate-800/40 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                ONVIF Devices
                <span className="text-xs font-normal text-slate-500">({onvifResults.length})</span>
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800/40">
                    {['Name', 'IP', 'Manufacturer', 'Model', 'ONVIF', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {onvifResults.map((dev) => {
                    const isAdded = existingIps.has(dev.ip);
                    return (
                      <tr
                        key={dev.ip}
                        className={`border-b border-slate-800/20 transition-colors ${
                          isAdded ? 'bg-emerald-500/5' : 'hover:bg-slate-800/30'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium text-white">{dev.name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-slate-300">{dev.ip}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-400">{dev.manufacturer}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-400 font-mono">{dev.model}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                            <Shield className="w-2.5 h-2.5" />
                            ONVIF
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {isAdded ? (
                            <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                              <Check className="w-3.5 h-3.5" />
                              Added
                            </span>
                          ) : (
                            <button
                              onClick={() => setOnvifCredModal(dev)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                            >
                              Configure & Add
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>
        )}

        {/* ─── Auto Discover Tab ─────────────────────────────── */}
        {activeTab === 'auto' && (
        <>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Zap className={`w-5 h-5 text-amber-400 ${autoScanning ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Auto Discover</h2>
              <p className="text-xs text-slate-500">Scans USB + Network + ONVIF — adds cameras automatically</p>
            </div>
          </div>
          <button
            onClick={handleAutoDiscover}
            disabled={autoScanning}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20"
          >
            {autoScanning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {autoScanning ? 'Scanning all sources...' : 'Scan & Auto-Add'}
          </button>
        </div>

        {autoScanning && (
          <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-8 text-center animate-fade-in">
            <Loader2 className="w-10 h-10 text-amber-400 animate-spin mx-auto mb-4" />
            <p className="text-sm text-slate-300 font-medium">Scanning all sources...</p>
            <div className="flex items-center justify-center gap-6 mt-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><Usb className="w-3.5 h-3.5" /> USB Cameras</span>
              <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> ONVIF Discovery</span>
              <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Network Ports</span>
            </div>
            <p className="text-[10px] text-slate-600 mt-3">This may take 30-60 seconds for a full subnet scan</p>
          </div>
        )}

        {!autoScanning && !autoResult && (
          <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-12 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-amber-500/60" />
            </div>
            <h3 className="text-lg font-semibold text-slate-300 mb-2">One-Click Auto Discovery</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-2">
              Automatically scans for all cameras connected to your computer or network:
            </p>
            <div className="flex items-center justify-center gap-6 mt-4 mb-6">
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <Usb className="w-5 h-5 text-blue-400" />
                </div>
                <span className="text-[10px] text-slate-500">USB Webcams</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-emerald-400" />
                </div>
                <span className="text-[10px] text-slate-500">ONVIF Cameras</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-purple-400" />
                </div>
                <span className="text-[10px] text-slate-500">IP Cameras</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <Camera className="w-5 h-5 text-cyan-400" />
                </div>
                <span className="text-[10px] text-slate-500">HTTP Cameras</span>
              </div>
            </div>
            <button
              onClick={handleAutoDiscover}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg text-sm font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400 transition-all shadow-lg shadow-amber-500/20"
            >
              <Zap className="w-4 h-4" />
              Start Auto Discovery
            </button>
            <p className="text-[10px] text-slate-600 mt-4">Requires the gateway server running on port 5055</p>
          </div>
        )}

        {!autoScanning && autoResult && (
          <div className="space-y-4 animate-fade-in">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 text-center">
                <Usb className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white">{autoResult.summary?.usbFound || 0}</p>
                <p className="text-[10px] text-slate-500">USB Cameras</p>
              </div>
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-center">
                <Shield className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white">{autoResult.summary?.onvifFound || 0}</p>
                <p className="text-[10px] text-slate-500">ONVIF Devices</p>
              </div>
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4 text-center">
                <Globe className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white">{autoResult.summary?.networkFound || 0}</p>
                <p className="text-[10px] text-slate-500">Network Devices</p>
              </div>
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-center">
                <Check className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white">{autoResult.summary?.added || 0}</p>
                <p className="text-[10px] text-slate-500">Auto-Added</p>
              </div>
            </div>

            {/* Added cameras list */}
            {autoResult.added && autoResult.added.length > 0 && (
              <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800/40">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" />
                    Cameras Added Automatically
                    <span className="text-xs font-normal text-slate-500">({autoResult.added.length})</span>
                  </h3>
                </div>
                <div className="divide-y divide-slate-800/30">
                  {autoResult.added.map((cam) => (
                    <div key={cam.id} className="px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                          {cam.type === 'USB' ? <Usb className="w-4 h-4 text-emerald-400" /> :
                           cam.type === 'HTTP' ? <Camera className="w-4 h-4 text-emerald-400" /> :
                           <MonitorSmartphone className="w-4 h-4 text-emerald-400" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{cam.name}</p>
                          <p className="text-[10px] text-slate-500">{cam.ip}{cam.port ? `:${cam.port}` : ''} — {cam.type} — {cam.brand}</p>
                        </div>
                      </div>
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                        <Check className="w-3 h-3" />
                        Added
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Already existing */}
            {autoResult.summary?.alreadyExists > 0 && (
              <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4 flex items-center gap-3">
                <Wifi className="w-5 h-5 text-slate-400" />
                <p className="text-sm text-slate-400">
                  {autoResult.summary.alreadyExists} camera(s) already in the system — skipped.
                </p>
              </div>
            )}

            {/* No cameras found */}
            {(autoResult.summary?.added === 0 && autoResult.summary?.alreadyExists === 0) && (
              <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-8 text-center">
                <WifiOff className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-slate-300 mb-1">No New Cameras Found</h3>
                <p className="text-sm text-slate-500">No new cameras were detected. Try adding manually or check your network connection.</p>
              </div>
            )}

            {/* Errors */}
            {autoResult.errors && autoResult.errors.length > 0 && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                <p className="text-xs font-medium text-red-400 mb-2">Scan Warnings:</p>
                {autoResult.errors.map((err, i) => (
                  <p key={i} className="text-[10px] text-red-400/70">{err}</p>
                ))}
              </div>
            )}

            {/* Scan again button */}
            <div className="text-center pt-2">
              <button
                onClick={handleAutoDiscover}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-slate-800 border border-slate-700/50 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Scan Again
              </button>
            </div>
          </div>
        )}
        </>
        )}

        {/* ─── ONVIF Credential Modal ──────────────────────── */}
        {onvifCredModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-white">Add ONVIF Camera</h3>
                <button onClick={() => { setOnvifCredModal(null); setOnvifError(null); }} className="text-slate-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-800/60 rounded-lg p-3 text-xs text-slate-400 space-y-1">
                  <div><span className="text-slate-500">IP:</span> {onvifCredModal.ip}</div>
                  <div><span className="text-slate-500">Manufacturer:</span> {onvifCredModal.manufacturer}</div>
                  <div><span className="text-slate-500">Model:</span> {onvifCredModal.model}</div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Camera Name</label>
                  <input
                    type="text"
                    value={onvifCreds.name}
                    onChange={(e) => setOnvifCreds((p) => ({ ...p, name: e.target.value }))}
                    placeholder={onvifCredModal.name}
                    className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Username</label>
                  <input
                    type="text"
                    value={onvifCreds.username}
                    onChange={(e) => setOnvifCreds((p) => ({ ...p, username: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700/50 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Password</label>
                  <div className="relative">
                    <input
                      type={showOnvifPassword ? 'text' : 'password'}
                      value={onvifCreds.password}
                      onChange={(e) => setOnvifCreds((p) => ({ ...p, password: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700/50 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500/50 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOnvifPassword(!showOnvifPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showOnvifPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {onvifError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400">
                    {onvifError}
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => { setOnvifCredModal(null); setOnvifError(null); }}
                    className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-400 border border-slate-700/50 hover:text-white hover:border-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleOnvifAdd}
                    disabled={onvifAdding}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-emerald-500 to-green-500 text-white hover:from-emerald-400 hover:to-green-400 transition-all disabled:opacity-50"
                  >
                    {onvifAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {onvifAdding ? 'Connecting...' : 'Add Camera'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <AddCameraModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setPrefillCamera(null); }}
        onSave={handleSaveCamera}
        prefill={prefillCamera}
      />
    </>
  );
}
