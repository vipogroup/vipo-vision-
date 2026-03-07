import { useEffect, useMemo, useState } from 'react';
import {
  Settings,
  HardDrive,
  Bell,
  Users,
  Plug,
  Palette,
  Save,
  ChevronRight,
  Moon,
  Sun,
  Globe,
  Shield,
  Database,
  Trash2,
  Gauge,
  RotateCw,
  AlertTriangle,
} from 'lucide-react';
import Header from '../components/Header';
import { users } from '../data/users';
import { useLanguage } from '../hooks/useLanguage';
import { GATEWAY_BASE } from '../config';

const tabs = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'health', label: 'System Health', icon: Gauge },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'theme', label: 'Theme', icon: Palette },
];

function Toggle({ enabled, onChange }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        enabled ? 'bg-cyan-500' : 'bg-slate-700'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function SettingRow({ label, description, children }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-slate-800/30 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-200">{label}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0 ml-4">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { t, lang, changeLang } = useLanguage();
  const [activeTab, setActiveTab] = useState('general');
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState(null);
  const [settings, setSettings] = useState({
    systemName: 'VIPO Vision',
    language: lang,
    autoUpdate: true,
    motionNotifications: true,
    offlineNotifications: true,
    emailNotifications: false,
    soundAlerts: true,
    retentionDays: 30,
    autoCleanup: true,
    darkMode: true,
    compactView: false,
    accentColor: 'cyan',
  });

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const formatBytes = (bytes) => {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    const v = n / (1024 ** i);
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  };

  const refreshMetrics = async () => {
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const res = await fetch(`${GATEWAY_BASE}/api/metrics`, { headers: { 'Content-Type': 'application/json' } });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.message || `HTTP ${res.status}`);
      setMetrics(data);
    } catch (err) {
      setMetricsError(err?.message || 'Failed to fetch metrics');
    } finally {
      setMetricsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'health') return;
    void refreshMetrics();
    const tmr = setInterval(() => {
      void refreshMetrics();
    }, 5000);
    return () => clearInterval(tmr);
  }, [activeTab]);

  const streamItems = useMemo(() => metrics?.streams?.items || [], [metrics]);
  const recordingItems = useMemo(() => metrics?.recordings?.items || [], [metrics]);

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div>
            <h3 className="text-base font-semibold text-white mb-1">{t('settings.generalSettings')}</h3>
            <p className="text-xs text-slate-500 mb-6">{t('settings.generalDesc')}</p>
            <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl px-5">
              <SettingRow label={t('settings.systemName')} description={t('settings.systemNameDesc')}>
                <input
                  type="text"
                  value={settings.systemName}
                  onChange={(e) => updateSetting('systemName', e.target.value)}
                  className="px-3 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50 w-48 text-right"
                />
              </SettingRow>
              <SettingRow label={t('settings.language')} description={t('settings.languageDesc')}>
                <select
                  value={settings.language}
                  onChange={(e) => { updateSetting('language', e.target.value); changeLang(e.target.value); }}
                  className="px-3 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50 appearance-none cursor-pointer"
                >
                  <option value="en" className="bg-slate-800">English</option>
                  <option value="he" className="bg-slate-800">עברית</option>
                  <option value="es" className="bg-slate-800">Español</option>
                </select>
              </SettingRow>
              <SettingRow label={t('settings.autoUpdate')} description={t('settings.autoUpdateDesc')}>
                <Toggle enabled={settings.autoUpdate} onChange={(v) => updateSetting('autoUpdate', v)} />
              </SettingRow>
              <SettingRow label={t('settings.timeZone')} description={t('settings.timeZoneDesc')}>
                <span className="text-sm text-slate-300 font-medium">UTC+02:00</span>
              </SettingRow>
              <SettingRow label={t('settings.version')} description={t('settings.versionDesc')}>
                <span className="text-sm text-slate-400 font-mono">v1.0.0</span>
              </SettingRow>
            </div>
          </div>
        );

      case 'health':
        return (
          <div>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold text-white mb-1">System Health</h3>
                <p className="text-xs text-slate-500">Gateway metrics (auto-refresh every 5s)</p>
              </div>
              <button
                onClick={() => void refreshMetrics()}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800/60 border border-slate-700/50 text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <RotateCw className={metricsLoading ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
                Refresh
              </button>
            </div>

            {metricsError && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>{metricsError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 text-center">
                <Gauge className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
                <p className="text-lg font-bold text-white">{metrics?.process?.uptimeSec ?? '—'}s</p>
                <p className="text-xs text-slate-500 mt-1">Process Uptime</p>
              </div>
              <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 text-center">
                <Database className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                <p className="text-lg font-bold text-white">{formatBytes(metrics?.process?.memory?.rss)}</p>
                <p className="text-xs text-slate-500 mt-1">Process RSS</p>
              </div>
              <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 text-center">
                <HardDrive className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                <p className="text-lg font-bold text-white">{formatBytes(metrics?.os?.freeMemBytes)} / {formatBytes(metrics?.os?.totalMemBytes)}</p>
                <p className="text-xs text-slate-500 mt-1">Free / Total Memory</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-white">Streams</h4>
                  <span className="text-xs text-slate-400 font-mono">{metrics?.streams?.counts?.running ?? 0} running</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-800/40 rounded-lg p-3">
                    <p className="text-slate-400">Total</p>
                    <p className="text-white font-semibold mt-1">{metrics?.streams?.counts?.total ?? 0}</p>
                  </div>
                  <div className="bg-slate-800/40 rounded-lg p-3">
                    <p className="text-slate-400">Starting</p>
                    <p className="text-white font-semibold mt-1">{metrics?.streams?.counts?.starting ?? 0}</p>
                  </div>
                  <div className="bg-slate-800/40 rounded-lg p-3">
                    <p className="text-slate-400">Running</p>
                    <p className="text-emerald-300 font-semibold mt-1">{metrics?.streams?.counts?.running ?? 0}</p>
                  </div>
                  <div className="bg-slate-800/40 rounded-lg p-3">
                    <p className="text-slate-400">Errors</p>
                    <p className="text-red-300 font-semibold mt-1">{metrics?.streams?.counts?.error ?? 0}</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-white">Recordings</h4>
                  <span className="text-xs text-slate-400 font-mono">{metrics?.recordings?.counts?.recording ?? 0} active</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-800/40 rounded-lg p-3">
                    <p className="text-slate-400">Total</p>
                    <p className="text-white font-semibold mt-1">{metrics?.recordings?.counts?.total ?? 0}</p>
                  </div>
                  <div className="bg-slate-800/40 rounded-lg p-3">
                    <p className="text-slate-400">Recording</p>
                    <p className="text-emerald-300 font-semibold mt-1">{metrics?.recordings?.counts?.recording ?? 0}</p>
                  </div>
                  <div className="bg-slate-800/40 rounded-lg p-3">
                    <p className="text-slate-400">Stopped</p>
                    <p className="text-white font-semibold mt-1">{metrics?.recordings?.counts?.stopped ?? 0}</p>
                  </div>
                  <div className="bg-slate-800/40 rounded-lg p-3">
                    <p className="text-slate-400">Errors</p>
                    <p className="text-red-300 font-semibold mt-1">{metrics?.recordings?.counts?.error ?? 0}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800/40 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">Active Streams</h4>
                <span className="text-xs text-slate-500 font-mono">{metrics?.at || ''}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-900/60">
                    <tr className="text-slate-400">
                      <th className="text-left px-5 py-3 font-medium">Camera</th>
                      <th className="text-left px-5 py-3 font-medium">State</th>
                      <th className="text-left px-5 py-3 font-medium">Mode</th>
                      <th className="text-left px-5 py-3 font-medium">Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {streamItems.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-6 text-slate-500">No active streams</td>
                      </tr>
                    ) : (
                      streamItems.map((s) => (
                        <tr key={s.cameraId} className="border-t border-slate-800/30">
                          <td className="px-5 py-3 text-slate-200 font-mono">{s.cameraId}</td>
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${
                              s.state === 'running'
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                                : s.state === 'starting'
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                : 'bg-red-500/10 text-red-300 border-red-500/20'
                            }`}>
                              {s.state}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-slate-300">{s.mode || '—'}</td>
                          <td className="px-5 py-3 text-slate-500 font-mono">{s.startedAt ? new Date(s.startedAt).toLocaleTimeString('en-US', { hour12: false }) : '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {recordingItems.length > 0 && (
              <div className="mt-6 bg-slate-900/40 border border-slate-800/50 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800/40">
                  <h4 className="text-sm font-semibold text-white">Active Recordings</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-900/60">
                      <tr className="text-slate-400">
                        <th className="text-left px-5 py-3 font-medium">Camera</th>
                        <th className="text-left px-5 py-3 font-medium">State</th>
                        <th className="text-left px-5 py-3 font-medium">File</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recordingItems.map((r) => (
                        <tr key={r.cameraId} className="border-t border-slate-800/30">
                          <td className="px-5 py-3 text-slate-200 font-mono">{r.cameraId}</td>
                          <td className="px-5 py-3 text-slate-300">{r.state}</td>
                          <td className="px-5 py-3 text-slate-500 font-mono">{r.fileName || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );

      case 'storage':
        return (
          <div>
            <h3 className="text-base font-semibold text-white mb-1">Storage Management</h3>
            <p className="text-xs text-slate-500 mb-6">Manage recording storage and retention</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 text-center">
                <Database className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">4.2 TB</p>
                <p className="text-xs text-slate-500 mt-1">Total Capacity</p>
              </div>
              <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 text-center">
                <HardDrive className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">3.3 TB</p>
                <p className="text-xs text-slate-500 mt-1">Used</p>
              </div>
              <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-4 text-center">
                <HardDrive className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">924 GB</p>
                <p className="text-xs text-slate-500 mt-1">Available</p>
              </div>
            </div>
            <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl px-5">
              <SettingRow label="Retention Period" description="Days to keep recordings before auto-delete">
                <select
                  value={settings.retentionDays}
                  onChange={(e) => updateSetting('retentionDays', Number(e.target.value))}
                  className="px-3 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50 appearance-none cursor-pointer"
                >
                  <option value={7} className="bg-slate-800">7 days</option>
                  <option value={14} className="bg-slate-800">14 days</option>
                  <option value={30} className="bg-slate-800">30 days</option>
                  <option value={60} className="bg-slate-800">60 days</option>
                  <option value={90} className="bg-slate-800">90 days</option>
                </select>
              </SettingRow>
              <SettingRow label="Auto Cleanup" description="Automatically remove old recordings">
                <Toggle enabled={settings.autoCleanup} onChange={(v) => updateSetting('autoCleanup', v)} />
              </SettingRow>
              <SettingRow label="Clear All Recordings" description="Permanently delete all recorded footage">
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 bg-red-400/10 border border-red-400/20 hover:bg-red-400/20 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </button>
              </SettingRow>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div>
            <h3 className="text-base font-semibold text-white mb-1">Notification Settings</h3>
            <p className="text-xs text-slate-500 mb-6">Configure alerts and notification preferences</p>
            <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl px-5">
              <SettingRow label="Motion Alerts" description="Notify when motion is detected">
                <Toggle enabled={settings.motionNotifications} onChange={(v) => updateSetting('motionNotifications', v)} />
              </SettingRow>
              <SettingRow label="Camera Offline" description="Alert when a camera goes offline">
                <Toggle enabled={settings.offlineNotifications} onChange={(v) => updateSetting('offlineNotifications', v)} />
              </SettingRow>
              <SettingRow label="Email Notifications" description="Send alerts to email">
                <Toggle enabled={settings.emailNotifications} onChange={(v) => updateSetting('emailNotifications', v)} />
              </SettingRow>
              <SettingRow label="Sound Alerts" description="Play sound on new events">
                <Toggle enabled={settings.soundAlerts} onChange={(v) => updateSetting('soundAlerts', v)} />
              </SettingRow>
            </div>
          </div>
        );

      case 'users':
        return (
          <div>
            <h3 className="text-base font-semibold text-white mb-1">User Management</h3>
            <p className="text-xs text-slate-500 mb-6">Manage system users and permissions</p>
            <div className="space-y-3">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between px-5 py-4 bg-slate-900/40 border border-slate-800/50 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-sm font-bold text-white">
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{u.name}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        u.role === 'admin'
                          ? 'bg-cyan-400/10 text-cyan-400 border border-cyan-400/20'
                          : u.role === 'operator'
                          ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                          : 'bg-slate-400/10 text-slate-400 border border-slate-400/20'
                      }`}
                    >
                      {u.role}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full ${u.status === 'active' ? 'bg-emerald-400' : 'bg-slate-600'}`}
                    />
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'integrations':
        return (
          <div>
            <h3 className="text-base font-semibold text-white mb-1">Camera Integrations</h3>
            <p className="text-xs text-slate-500 mb-6">Supported connection protocols and adapters</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { name: 'RTSP', desc: 'Real-Time Streaming Protocol', status: 'active', icon: Globe },
                { name: 'ONVIF', desc: 'Open Network Video Interface', status: 'active', icon: Shield },
                { name: 'USB Camera', desc: 'Local USB webcam support', status: 'active', icon: Plug },
                { name: 'P2P / Cloud', desc: 'Peer-to-peer camera adapters', status: 'coming', icon: Globe },
              ].map((item) => (
                <div
                  key={item.name}
                  className="flex items-center gap-4 px-5 py-4 bg-slate-900/40 border border-slate-800/50 rounded-xl"
                >
                  <div className="p-2.5 rounded-lg bg-slate-800/60">
                    <item.icon className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.desc}</p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                      item.status === 'active'
                        ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20'
                        : 'bg-slate-400/10 text-slate-400 border-slate-400/20'
                    }`}
                  >
                    {item.status === 'active' ? 'Active' : 'Coming Soon'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );

      case 'theme':
        return (
          <div>
            <h3 className="text-base font-semibold text-white mb-1">Theme & Appearance</h3>
            <p className="text-xs text-slate-500 mb-6">Customize the look and feel</p>
            <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl px-5">
              <SettingRow label="Dark Mode" description="Use dark color scheme">
                <div className="flex items-center gap-2">
                  {settings.darkMode ? <Moon className="w-4 h-4 text-cyan-400" /> : <Sun className="w-4 h-4 text-amber-400" />}
                  <Toggle enabled={settings.darkMode} onChange={(v) => updateSetting('darkMode', v)} />
                </div>
              </SettingRow>
              <SettingRow label="Compact View" description="Reduce spacing for more content">
                <Toggle enabled={settings.compactView} onChange={(v) => updateSetting('compactView', v)} />
              </SettingRow>
              <SettingRow label="Accent Color" description="Primary accent color">
                <div className="flex items-center gap-2">
                  {['cyan', 'blue', 'emerald', 'purple', 'amber'].map((color) => (
                    <button
                      key={color}
                      onClick={() => updateSetting('accentColor', color)}
                      className={`w-7 h-7 rounded-full transition-all ${
                        color === 'cyan'
                          ? 'bg-cyan-500'
                          : color === 'blue'
                          ? 'bg-blue-500'
                          : color === 'emerald'
                          ? 'bg-emerald-500'
                          : color === 'purple'
                          ? 'bg-purple-500'
                          : 'bg-amber-500'
                      } ${settings.accentColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110' : 'opacity-60 hover:opacity-100'}`}
                    />
                  ))}
                </div>
              </SettingRow>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Header title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <div className="flex-1 p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="lg:w-56 flex-shrink-0">
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-cyan-500/10 text-cyan-400'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <tab.icon className="w-4.5 h-4.5" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex-1 animate-fade-in" key={activeTab}>
            {renderContent()}
            <div className="mt-6 flex justify-end">
              <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-400 hover:to-blue-400 transition-all shadow-lg shadow-cyan-500/20">
                <Save className="w-4 h-4" />
                {t('settings.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
