import { useRegisterSW } from 'virtual:pwa-register/react';

export default function UpdateNotifier() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Check for updates every 60 seconds
      setInterval(() => {
        registration.update();
      }, 60 * 1000);
    },
    onRegisterError(error) {
      console.error('SW registration error:', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-slate-800 border border-cyan-500/50 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-fade-in">
      <span className="text-sm">גרסה חדשה זמינה</span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium px-3 py-1 rounded-lg transition-colors"
      >
        עדכן עכשיו
      </button>
    </div>
  );
}
