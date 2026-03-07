import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Camera,
  Video,
  AlertTriangle,
  Settings,
  LogOut,
  Shield,
  ChevronLeft,
  ChevronRight,
  Radar,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { useState } from 'react';

const navItems = [
  { to: '/', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { to: '/cameras', icon: Camera, labelKey: 'nav.cameras' },
  { to: '/discover', icon: Radar, labelKey: 'nav.discover' },
  { to: '/recordings', icon: Video, labelKey: 'nav.recordings' },
  { to: '/events', icon: AlertTriangle, labelKey: 'nav.events' },
  { to: '/settings', icon: Settings, labelKey: 'nav.settings' },
];

export default function Sidebar() {
  const { logout, user } = useAuth();
  const { t } = useLanguage();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`${
        collapsed ? 'w-[72px]' : 'w-[240px]'
      } h-screen bg-slate-900/80 backdrop-blur-xl border-r border-slate-800/60 flex flex-col transition-all duration-300 ease-in-out flex-shrink-0`}
    >
      <div className="h-16 flex items-center gap-3 px-4 border-b border-slate-800/60">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center flex-shrink-0">
          <Shield className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="animate-fade-in">
            <h1 className="text-sm font-bold tracking-wide text-white">{t('app.name')}</h1>
            <p className="text-[10px] text-slate-500 font-medium tracking-wider uppercase">{t('app.tagline')}</p>
          </div>
        )}
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                isActive
                  ? 'bg-cyan-500/10 text-cyan-400 shadow-sm shadow-cyan-500/5'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>{t(item.labelKey)}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="p-2 border-t border-slate-800/60 space-y-1">
        {!collapsed && user && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-slate-300 truncate">{user.name}</p>
            <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-400/5 transition-all duration-200 w-full"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>{t('nav.logout')}</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center gap-3 px-3 py-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-all duration-200 w-full"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {!collapsed && <span className="text-xs">{t('nav.collapse')}</span>}
        </button>
      </div>
    </aside>
  );
}
