import { NavLink, useLocation } from 'react-router-dom';
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
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { useState, useEffect } from 'react';

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const sidebarContent = (showLabels) => (
    <>
      <div className="h-16 flex items-center gap-3 px-4 border-b border-slate-800/60 flex-shrink-0">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center flex-shrink-0">
          <Shield className="w-5 h-5 text-white" />
        </div>
        {showLabels && (
          <div className="animate-fade-in">
            <h1 className="text-sm font-bold tracking-wide text-white">{t('app.name')}</h1>
            <p className="text-[10px] text-slate-500 font-medium tracking-wider uppercase">{t('app.tagline')}</p>
          </div>
        )}
        <button
          onClick={() => setMobileOpen(false)}
          className="ml-auto p-2 rounded-lg text-slate-400 hover:text-white md:hidden"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group min-h-[44px] ${
                isActive
                  ? 'bg-cyan-500/10 text-cyan-400 shadow-sm shadow-cyan-500/5'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {showLabels && <span>{t(item.labelKey)}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="p-2 border-t border-slate-800/60 space-y-1 flex-shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {showLabels && user && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-slate-300 truncate">{user.name}</p>
            <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-400/5 transition-all duration-200 w-full min-h-[44px]"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {showLabels && <span>{t('nav.logout')}</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex items-center justify-center gap-3 px-3 py-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-all duration-200 w-full"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {!collapsed && <span className="text-xs">{t('nav.collapse')}</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 p-2 rounded-lg bg-slate-800/90 backdrop-blur-sm border border-slate-700/50 text-slate-300 hover:text-white md:hidden"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-slate-900/95 backdrop-blur-xl border-r border-slate-800/60 flex flex-col transition-transform duration-300 ease-in-out md:hidden pt-[env(safe-area-inset-top)] ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent(true)}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex ${
          collapsed ? 'w-[72px]' : 'w-[240px]'
        } h-screen bg-slate-900/80 backdrop-blur-xl border-r border-slate-800/60 flex-col transition-all duration-300 ease-in-out flex-shrink-0`}
      >
        {sidebarContent(!collapsed)}
      </aside>
    </>
  );
}
