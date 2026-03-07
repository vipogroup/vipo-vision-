import { useState } from 'react';
import { X, Wifi, Check, Loader2 } from 'lucide-react';

const connectionTypes = ['RTSP', 'ONVIF', 'HTTP', 'USB', 'P2P'];

function buildInitialForm(prefill) {
  if (!prefill) {
    return { name: '', type: 'RTSP', ip: '', port: '554', username: '', password: '', rtspUrl: '', location: '', group: '' };
  }
  return {
    name: prefill.name || '',
    type: prefill.type || 'RTSP',
    ip: prefill.ip || '',
    port: prefill.port || '554',
    username: prefill.username || '',
    password: prefill.password || '',
    rtspUrl: prefill.rtspUrl || '',
    location: prefill.location || '',
    group: prefill.group || '',
  };
}

export default function AddCameraModal({ isOpen, onClose, onSave, prefill = null }) {
  if (!isOpen) return null;
  return <AddCameraModalInner onClose={onClose} onSave={onSave} prefill={prefill} />;
}

function AddCameraModalInner({ onClose, onSave, prefill }) {
  const [form, setForm] = useState(() => buildInitialForm(prefill));
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    await new Promise((r) => setTimeout(r, 1500));
    const success = Math.random() > 0.3;
    setTestResult({
      success,
      message: success
        ? 'Connection successful — stream detected'
        : 'Connection failed — verify address and credentials',
    });
    setTesting(false);
  };

  const handleSave = () => {
    onSave({
      ...form,
      port: parseInt(form.port, 10) || 554,
      resolution: '1920x1080',
      fps: 25,
      codec: 'H.264',
    });
    setForm(buildInitialForm(null));
    setTestResult(null);
    onClose();
  };

  const isValid = form.name && form.ip;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/50 animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/60">
          <div>
            <h2 className="text-lg font-semibold text-white">Add Camera</h2>
            <p className="text-xs text-slate-500 mt-0.5">Configure a new camera connection</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Camera Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g. Main Entrance"
              className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Connection Type</label>
            <div className="grid grid-cols-4 gap-2">
              {connectionTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => handleChange('type', type)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                    form.type === type
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
                      : 'bg-slate-800/40 border-slate-700/40 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">IP / Host</label>
              <input
                type="text"
                value={form.ip}
                onChange={(e) => handleChange('ip', e.target.value)}
                placeholder="192.168.1.100"
                className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Port</label>
              <input
                type="text"
                value={form.port}
                onChange={(e) => handleChange('port', e.target.value)}
                placeholder="554"
                className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Username</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => handleChange('username', e.target.value)}
                placeholder="admin"
                className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => handleChange('password', e.target.value)}
                placeholder="••••••"
                className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
              />
            </div>
          </div>

          {(form.type === 'RTSP' || form.type === 'ONVIF') && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">RTSP URL</label>
              <input
                type="text"
                value={form.rtspUrl}
                onChange={(e) => handleChange('rtspUrl', e.target.value)}
                placeholder="rtsp://192.168.1.100:554/stream1"
                className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors font-mono text-xs"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => handleChange('location', e.target.value)}
                placeholder="Building A — Lobby"
                className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Group</label>
              <input
                type="text"
                value={form.group}
                onChange={(e) => handleChange('group', e.target.value)}
                placeholder="Entrances"
                className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
              />
            </div>
          </div>

          {testResult && (
            <div
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                testResult.success
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}
            >
              {testResult.success ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
              {testResult.message}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800/60">
          <button
            onClick={handleTest}
            disabled={!form.ip || testing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-800 border border-slate-700/50 text-slate-300 hover:text-white hover:border-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {testing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wifi className="w-4 h-4" />
            )}
            Test Connection
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isValid}
              className="px-5 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-400 hover:to-blue-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
            >
              Save Camera
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
