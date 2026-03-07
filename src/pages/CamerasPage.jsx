import { useState, useMemo } from 'react';
import { Plus, Search, Pencil, Trash2, Eye, Wifi, WifiOff, Filter } from 'lucide-react';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import AddCameraModal from '../components/AddCameraModal';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import { cameraStore, useCameraStore } from '../stores/cameraStore';

export default function CamerasPage() {
  const { t } = useLanguage();
  const { cameras, loading } = useCameraStore();
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const navigate = useNavigate();

  const groups = useMemo(() => {
    const uniq = new Set(cameras.map((c) => c.group).filter(Boolean));
    return ['All', ...Array.from(uniq).sort((a, b) => a.localeCompare(b))];
  }, [cameras]);

  const filtered = cameras.filter((cam) => {
    const matchSearch =
      cam.name.toLowerCase().includes(search.toLowerCase()) ||
      cam.ip.toLowerCase().includes(search.toLowerCase()) ||
      cam.location.toLowerCase().includes(search.toLowerCase());
    const matchGroup = filterGroup === 'All' || cam.group === filterGroup;
    return matchSearch && matchGroup;
  });

  const handleAddCamera = async (data) => {
    try {
      await cameraStore.addCamera(data);
    } catch { /* ignore */ }
  };

  const handleDelete = async (id) => {
    try {
      await cameraStore.removeCamera(id);
    } catch { /* ignore */ }
  };

  return (
    <>
      <Header
        title={t('cameras.title')}
        subtitle={loading ? 'Loading…' : `${cameras.length} ${t('nav.cameras').toLowerCase()}`}
      />
      <div className="flex-1 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('cameras.search')}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <select
                value={filterGroup}
                onChange={(e) => setFilterGroup(e.target.value)}
                className="pl-10 pr-8 py-2.5 bg-slate-900/60 border border-slate-800/50 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50 appearance-none cursor-pointer"
              >
                {groups.map((g) => (
                  <option key={g} value={g} className="bg-slate-800">
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-400 hover:to-blue-400 transition-all shadow-lg shadow-cyan-500/20"
          >
            <Plus className="w-4 h-4" />
            Add Camera
          </button>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800/50">
                  <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Camera</th>
                  <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">IP Address</th>
                  <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Resolution</th>
                  <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Group</th>
                  <th className="text-right px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/30">
                {filtered.map((cam) => (
                  <tr
                    key={cam.id}
                    className="hover:bg-slate-800/20 transition-colors group"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-800/80 flex items-center justify-center flex-shrink-0">
                          {cam.status === 'offline' ? (
                            <WifiOff className="w-4 h-4 text-red-400" />
                          ) : (
                            <Wifi className="w-4 h-4 text-cyan-400" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white group-hover:text-cyan-400 transition-colors">
                            {cam.name}
                          </p>
                          <p className="text-xs text-slate-500">{cam.location}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-medium text-slate-300 bg-slate-800/50 px-2.5 py-1 rounded-md">
                        {cam.type}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-slate-300 font-mono">{cam.ip}:{cam.port}</span>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={cam.status} />
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-slate-400">{cam.resolution}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-slate-400">{cam.group}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate(`/camera/${cam.id}`)}
                          className="p-2 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-cyan-400/10 transition-colors"
                          title="Preview"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          className="p-2 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(cam.id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan="7" className="px-5 py-12 text-center text-sm text-slate-500">
                      No cameras match your search
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AddCameraModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleAddCamera}
      />
    </>
  );
}
