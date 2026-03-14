import { useState, useCallback, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import CameraCard from './CameraCard';

const gridClasses = {
  1: 'grid-cols-1 grid-rows-1',
  4: 'grid-cols-2 grid-rows-2',
  9: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 lg:grid-rows-3',
  16: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 lg:grid-rows-4',
};

const STORAGE_KEY = 'vipo-slot-assignments';

function loadAssignments() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveAssignments(assignments) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments)); } catch {}
}

function SlotSelector({ slotIndex, cameras, assignedCameraId, onAssign }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute top-0.5 right-0.5 z-40">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/70 hover:bg-black/90 text-[9px] font-mono text-cyan-400 border border-cyan-500/30 transition-colors"
        title="בחר מצלמה לנגן זה"
      >
        <span>#{slotIndex + 1}</span>
        <ChevronDown className="w-2.5 h-2.5" />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-0.5 bg-slate-900/95 border border-slate-600 rounded shadow-xl min-w-[160px] max-h-[200px] overflow-y-auto z-50">
          <button
            onClick={(e) => { e.stopPropagation(); onAssign(slotIndex, null); setOpen(false); }}
            className={`w-full text-left px-2 py-1.5 text-[10px] hover:bg-slate-700 transition-colors ${
              !assignedCameraId ? 'text-cyan-400 bg-slate-800' : 'text-slate-300'
            }`}
          >
            (אוטומטי)
          </button>
          {cameras.map((cam) => (
            <button
              key={cam.id}
              onClick={(e) => { e.stopPropagation(); onAssign(slotIndex, cam.id); setOpen(false); }}
              className={`w-full text-left px-2 py-1.5 text-[10px] hover:bg-slate-700 transition-colors ${
                assignedCameraId === cam.id ? 'text-cyan-400 bg-slate-800' : 'text-slate-300'
              }`}
            >
              <span className="font-medium">{cam.name || cam.id}</span>
              <span className="text-slate-500 ml-1">({cam.id})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CameraGrid({ cameras, gridSize = 4, streamMode = 'hd' }) {
  const [assignments, setAssignments] = useState(loadAssignments);
  const cols = gridClasses[gridSize] || gridClasses[4];
  const compact = gridSize >= 9;

  // Close any open dropdown when clicking outside
  useEffect(() => {
    const handler = () => {};
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const handleAssign = useCallback((slotIndex, cameraId) => {
    setAssignments((prev) => {
      const next = { ...prev };
      if (cameraId === null) {
        delete next[slotIndex];
      } else {
        next[slotIndex] = cameraId;
      }
      saveAssignments(next);
      return next;
    });
  }, []);

  // Build the display list: for each slot, use manual assignment if set, otherwise auto-fill
  const slots = [];
  const usedIds = new Set();

  // First pass: fill manually assigned slots
  for (let i = 0; i < gridSize; i++) {
    const assignedId = assignments[i];
    if (assignedId) {
      const cam = cameras.find((c) => c.id === assignedId);
      if (cam) {
        slots[i] = cam;
        usedIds.add(assignedId);
      }
    }
  }

  // Second pass: auto-fill remaining slots with unassigned cameras
  const unassigned = cameras.filter((c) => !usedIds.has(c.id));
  let autoIdx = 0;
  for (let i = 0; i < gridSize; i++) {
    if (!slots[i]) {
      slots[i] = unassigned[autoIdx] || null;
      if (unassigned[autoIdx]) {
        usedIds.add(unassigned[autoIdx].id);
        autoIdx++;
      }
    }
  }

  return (
    <div className={`grid ${cols} gap-1.5 sm:gap-2 md:gap-3 h-full`}>
      {slots.map((camera, idx) => (
        <div key={`slot-${idx}`} className="relative h-full">
          <SlotSelector
            slotIndex={idx}
            cameras={cameras}
            assignedCameraId={assignments[idx] || null}
            onAssign={handleAssign}
          />
          {camera ? (
            <CameraCard key={camera.id} camera={camera} compact={compact} fillHeight streamMode={streamMode} />
          ) : (
            <div className="flex items-center justify-center h-full bg-slate-900/50 rounded-lg border border-slate-700/50 text-slate-500 text-xs">
              נגן #{idx + 1} — לא הוקצתה מצלמה
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
