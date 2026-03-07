import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import AutoFitContent from './AutoFitContent';
import { useUIZoom } from '../hooks/useUIZoom';

export default function Layout() {
  const { zoom } = useUIZoom();

  return (
    <div
      className="flex h-screen overflow-hidden bg-slate-950"
      style={{
        zoom: zoom !== 1 ? zoom : undefined,
      }}
    >
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <AutoFitContent>
          <Outlet />
        </AutoFitContent>
      </main>
    </div>
  );
}
