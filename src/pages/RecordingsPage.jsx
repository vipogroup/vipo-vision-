import { useState } from 'react';
import { Search, Download, Play, Calendar, Filter, Video, Clock, HardDrive } from 'lucide-react';
import Header from '../components/Header';
import { recordings as allRecordings } from '../data/recordings';
import { formatDate, formatTime } from '../utils/helpers';
import { useLanguage } from '../hooks/useLanguage';
import { useCameraStore } from '../stores/cameraStore';

export default function RecordingsPage() {
  const { t } = useLanguage();
  const { cameras } = useCameraStore();
  const [search, setSearch] = useState('');
  const [filterCamera, setFilterCamera] = useState('all');
  const [filterType, setFilterType] = useState('all');

  const filtered = allRecordings.filter((rec) => {
    const matchSearch = rec.cameraName.toLowerCase().includes(search.toLowerCase());
    const matchCamera = filterCamera === 'all' || rec.cameraId === filterCamera;
    const matchType = filterType === 'all' || rec.type === filterType;
    return matchSearch && matchCamera && matchType;
  });

  return (
    <>
      <Header title={t('recordings.title')} subtitle={t('recordings.subtitle')} />
      <div className="flex-1 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search recordings..."
                className="pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors w-64"
              />
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
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2.5 bg-slate-900/60 border border-slate-800/50 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50 appearance-none cursor-pointer"
            >
              <option value="all" className="bg-slate-800">All Types</option>
              <option value="continuous" className="bg-slate-800">Continuous</option>
              <option value="motion" className="bg-slate-800">Motion</option>
            </select>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Calendar className="w-4 h-4" />
            <span>March 5–6, 2026</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((rec) => (
            <div
              key={rec.id}
              className="bg-slate-900/60 border border-slate-800/50 rounded-xl overflow-hidden group hover:border-cyan-500/30 transition-all duration-300"
            >
              <div className="relative aspect-video bg-slate-800/80 flex items-center justify-center">
                <Video className="w-8 h-8 text-slate-600" />
                {rec.hasMotion && (
                  <span className="absolute top-2 right-2 text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
                    MOTION
                  </span>
                )}
                <span className="absolute top-2 left-2 text-[10px] font-medium bg-slate-900/70 text-slate-300 px-2 py-0.5 rounded-full capitalize">
                  {rec.type}
                </span>
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button className="p-3 bg-cyan-500/20 backdrop-blur-sm border border-cyan-500/30 rounded-full text-cyan-400 hover:bg-cyan-500/30 transition-colors">
                    <Play className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="p-3.5">
                <h3 className="text-sm font-semibold text-white truncate group-hover:text-cyan-400 transition-colors">
                  {rec.cameraName}
                </h3>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDate(rec.startTime)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Clock className="w-3 h-3" />
                    <span>{formatTime(rec.startTime)} — {formatTime(rec.endTime)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <HardDrive className="w-3 h-3" />
                      <span>{rec.size}</span>
                    </div>
                    <span className="text-xs text-slate-400 font-medium">{rec.duration}</span>
                  </div>
                </div>
                <button className="mt-3 flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full flex items-center justify-center py-20">
              <p className="text-sm text-slate-500">No recordings match your filters</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
