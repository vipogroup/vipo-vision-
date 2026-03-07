import { useSyncExternalStore } from 'react';
import { cameraService } from '../services/cameraService.js';
import { cameras as fallbackCameras } from '../data/cameras.js';

function stripSecrets(cam) {
  if (!cam || typeof cam !== 'object') return cam;
  const copy = { ...cam };
  delete copy.password;
  delete copy.username;
  delete copy.rtspUrl;
  delete copy.httpUrl;
  delete copy.onvif;
  delete copy.httpCgi;
  return copy;
}

function stripSecretsList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(stripSecrets);
}

let state = {
  cameras: [],
  loading: false,
  error: null,
  usingFallback: false,
};

const listeners = new Set();

function emitChange() {
  for (const l of listeners) l();
}

function setState(patch) {
  state = { ...state, ...patch };
  emitChange();
}

export const cameraStore = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot() {
    return state;
  },

  getCameraById(id) {
    return state.cameras.find((c) => c.id === id) || null;
  },

  async loadCameras() {
    if (state.loading) return;
    setState({ loading: true, error: null });

    try {
      const cams = await cameraService.fetchCameras();
      setState({
        cameras: stripSecretsList(cams),
        loading: false,
        error: null,
        usingFallback: false,
      });
    } catch (err) {
      setState({
        cameras: stripSecretsList(fallbackCameras),
        loading: false,
        error: err?.message || 'Failed to load cameras',
        usingFallback: true,
      });
    }
  },

  async addCamera(payload) {
    const result = await cameraService.addCamera(payload);
    await cameraStore.loadCameras();
    return result;
  },

  async removeCamera(cameraId) {
    const result = await cameraService.deleteCamera(cameraId);
    await cameraStore.loadCameras();
    return result;
  },

  async updateCamera(cameraId, patch) {
    const result = await cameraService.updateCamera(cameraId, patch);
    await cameraStore.loadCameras();
    return result;
  },
};

export function useCameraStore() {
  return useSyncExternalStore(cameraStore.subscribe, cameraStore.getSnapshot, cameraStore.getSnapshot);
}
