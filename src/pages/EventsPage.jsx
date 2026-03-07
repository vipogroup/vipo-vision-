import { useState } from 'react';
import { Search, Filter, AlertTriangle, Wifi, WifiOff, Video, User, CheckCircle, Circle } from 'lucide-react';
import Header from '../components/Header';
import { events as allEvents, eventTypes } from '../data/events';
import { formatDateTime, getSeverityColor } from '../utils/helpers';
import { useLanguage } from '../hooks/useLanguage';
import { useCameraStore } from '../stores/cameraStore';

const typeIcons = {
  motion: AlertTriangle,
  offline: WifiOff,
  recording: Video,
  human: User,
};

const typeLabels = {
  all: 'All Events',
  motion: 'Motion',
  offline: 'Offline',
  recording: 'Recording',
  human: 'Human Detection',
};

export default function EventsPage() {
  const { t } = useLanguage();
  const { cameras } = useCameraStore();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterCamera, setFilterCamera] = useState('all');
  const [eventsState, setEventsState] = useState(allEvents);

  const filtered = eventsState.filter((evt) => {
    const matchSearch =
      evt.message.toLowerCase().includes(search.toLowerCase()) ||
      evt.cameraName.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || evt.type === filterType;
    const matchCamera = filterCamera === 'all' || evt.cameraId === filterCamera;
    return matchSearch && matchType && matchCamera;
  });

  const handleAcknowledge = (id) => {
    setEventsState((prev) =>
      prev.map((e) => (e.id === id ? { ...e, acknowledged: true } : e))
    );
  };

  const unacknowledgedCount = eventsState.filter((e) => !e.acknowledged).length;

  return (
    <>
      <Header title={t('events.title')} subtitle={`${unacknowledgedCount} ${t('events.title').toLowerCase()}`} />
      <div className="flex-1 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search events..."
                className="pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors w-64"
              />
            </div>
            <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800/50 rounded-lg p-1">
              {eventTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    filterType === type
                      ? 'bg-cyan-500/15 text-cyan-400'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  {typeLabels[type]}
                </button>
              ))}
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <select
                value={filterCamera}
                onChange={(e) => setFilterCamera(e.target.value)}
                className="pl-10 pr-8 py-2.5 bg-slate-900/60 border border-slate-800/50 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50 appearance-none cursor-pointer"
              >
                <option value="all" className="bg-slate-800">All Cameras</option>
                {cameras.map((cam) => (
                  <option key={cam.id} value={cam.id} className="bg-slate-800">
                    {cam.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-red-400">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                Critical ({eventsState.filter((e) => e.severity === 'critical').length})
              </span>
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Warning ({eventsState.filter((e) => e.severity === 'warning').length})
              </span>
              <span className="flex items-center gap-1.5 text-blue-400">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                Info ({eventsState.filter((e) => e.severity === 'info').length})
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {filtered.map((evt) => {
            const Icon = typeIcons[evt.type] || AlertTriangle;
            return (
              <div
                key={evt.id}
                className={`flex items-center gap-4 px-5 py-4 rounded-xl border transition-all duration-200 hover:bg-slate-800/30 ${
                  evt.acknowledged
                    ? 'bg-slate-900/30 border-slate-800/30 opacity-60'
                    : 'bg-slate-900/60 border-slate-800/50'
                }`}
              >
                <div
                  className={`p-2.5 rounded-lg flex-shrink-0 ${getSeverityColor(evt.severity)}`}
                >
                  <Icon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">{evt.message}</p>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border flex-shrink-0 ${getSeverityColor(
                        evt.severity
                      )}`}
                    >
                      {evt.severity}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Wifi className="w-3 h-3" />
                      {evt.cameraName}
                    </span>
                    <span className="text-xs text-slate-600">•</span>
                    <span className="text-xs text-slate-500">{formatDateTime(evt.timestamp)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {evt.acknowledged ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-500">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Ack
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAcknowledge(evt.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-emerald-400 bg-slate-800/40 hover:bg-emerald-400/10 border border-slate-700/40 hover:border-emerald-400/30 transition-all"
                    >
                      <Circle className="w-3 h-3" />
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="flex items-center justify-center py-20">
              <p className="text-sm text-slate-500">No events match your filters</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
