import CameraCard from './CameraCard';

const gridClasses = {
  1: 'grid-cols-1 grid-rows-1',
  4: 'grid-cols-2 grid-rows-2',
  9: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 lg:grid-rows-3',
  16: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 lg:grid-rows-4',
};

export default function CameraGrid({ cameras, gridSize = 4, streamMode = 'hd' }) {
  const displayCameras = cameras.slice(0, gridSize);
  const cols = gridClasses[gridSize] || gridClasses[4];
  const compact = gridSize >= 9;

  return (
    <div className={`grid ${cols} gap-1.5 sm:gap-2 md:gap-3 h-full`}>
      {displayCameras.map((camera) => (
        <CameraCard key={camera.id} camera={camera} compact={compact} fillHeight streamMode={streamMode} />
      ))}
      {displayCameras.length === 0 && (
        <div className="col-span-full flex items-center justify-center py-20 text-slate-500">
          <p className="text-sm">No cameras found</p>
        </div>
      )}
    </div>
  );
}
