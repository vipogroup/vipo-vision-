/**
 * VIPO Vision — PTZ Service (Adapter Delegation Layer)
 *
 * Dual-path:
 *   - Cameras with ptzType "onvif" or "http_cgi" → route through backend gateway
 *   - Mock/local cameras → use existing frontend mock adapter
 *
 * The usePTZ hook API is UNCHANGED.
 */

import { getAdapter } from './cameraAdapters';
import { GATEWAY_BASE } from '../config';
import { cameraStore } from '../stores/cameraStore';

function getCameraById(cameraId) {
  return cameraStore.getCameraById(cameraId) || null;
}

function isRealPtz(camera) {
  return camera?.ptzType === 'onvif' || camera?.ptzType === 'http_cgi';
}

function adapterFor(cameraId) {
  const camera = getCameraById(cameraId);
  return getAdapter(camera);
}

async function gw(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${GATEWAY_BASE}${path}`, opts);
  return res.json();
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const speedState = {};

export const ptzService = {
  async move(cameraId, direction, speed = 5) {
    const camera = getCameraById(cameraId);
    if (isRealPtz(camera)) {
      const result = await gw('POST', `/api/ptz/${cameraId}/move`, { direction, speed });
      return {
        success: result.success,
        cameraId,
        direction,
        speed,
        position: { pan: 0, tilt: 0 },
      };
    }

    const adapter = adapterFor(cameraId);
    const result = await adapter.ptzMove(direction, speed);
    const pos = result.data || (await adapter.ptzGetPosition());
    return {
      success: result.success !== false,
      cameraId,
      direction,
      speed,
      position: { pan: pos.pan, tilt: pos.tilt },
    };
  },

  async stop(cameraId) {
    const camera = getCameraById(cameraId);
    if (isRealPtz(camera)) {
      const result = await gw('POST', `/api/ptz/${cameraId}/stop`);
      return { success: result.success, cameraId, position: { pan: 0, tilt: 0 } };
    }

    const adapter = adapterFor(cameraId);
    await adapter.ptzStop();
    const pos = await adapter.ptzGetPosition();
    return {
      success: true,
      cameraId,
      position: { pan: pos.pan, tilt: pos.tilt },
    };
  },

  async getPosition(cameraId) {
    const camera = getCameraById(cameraId);
    if (isRealPtz(camera)) {
      return { pan: 0, tilt: 0, zoom: 1.0, isMoving: false };
    }

    const adapter = adapterFor(cameraId);
    const pos = await adapter.ptzGetPosition();
    const status = await adapter.getStatus();
    return {
      pan: pos.pan,
      tilt: pos.tilt,
      zoom: pos.zoom,
      isMoving: status.isMoving || false,
    };
  },

  async setSpeed(cameraId, speed) {
    speedState[cameraId] = clamp(speed, 1, 10);
    return { success: true, speed: speedState[cameraId] };
  },
};

export const zoomService = {
  async zoomIn(cameraId, step = 1.0) {
    const camera = getCameraById(cameraId);
    if (isRealPtz(camera)) {
      const result = await gw('POST', `/api/ptz/${cameraId}/zoom`, { mode: 'in' });
      return { success: result.success, cameraId, zoom: 1.0 };
    }

    const adapter = adapterFor(cameraId);
    const result = await adapter.zoomIn(step);
    const zoom = result.data?.zoom ?? 1.0;
    return { success: result.success !== false, cameraId, zoom };
  },

  async zoomOut(cameraId, step = 1.0) {
    const camera = getCameraById(cameraId);
    if (isRealPtz(camera)) {
      const result = await gw('POST', `/api/ptz/${cameraId}/zoom`, { mode: 'out' });
      return { success: result.success, cameraId, zoom: 1.0 };
    }

    const adapter = adapterFor(cameraId);
    const result = await adapter.zoomOut(step);
    const zoom = result.data?.zoom ?? 1.0;
    return { success: result.success !== false, cameraId, zoom };
  },

  async setZoom(cameraId, level) {
    const camera = getCameraById(cameraId);
    if (isRealPtz(camera)) {
      const result = await gw('POST', `/api/ptz/${cameraId}/zoom`, { mode: 'set', value: level });
      return { success: result.success, cameraId, zoom: level };
    }

    const adapter = adapterFor(cameraId);
    const result = await adapter.zoomSet(level);
    const zoom = result.data?.zoom ?? level;
    return { success: result.success !== false, cameraId, zoom };
  },

  async getZoom(cameraId) {
    const camera = getCameraById(cameraId);
    if (isRealPtz(camera)) {
      return { zoom: 1.0 };
    }

    const adapter = adapterFor(cameraId);
    const pos = await adapter.ptzGetPosition();
    return { zoom: pos.zoom };
  },
};

export const presetService = {
  async goToPreset(cameraId, preset) {
    const camera = getCameraById(cameraId);
    if (isRealPtz(camera)) {
      const result = await gw('POST', `/api/ptz/${cameraId}/presets/go`, { presetId: preset.id });
      return {
        success: result.success,
        cameraId,
        preset: preset.name,
        position: { pan: preset.pan || 0, tilt: preset.tilt || 0, zoom: preset.zoom || 1.0 },
      };
    }

    const adapter = adapterFor(cameraId);
    const result = await adapter.presetGo(preset.id);
    const pos = result.data || { pan: preset.pan, tilt: preset.tilt, zoom: preset.zoom };
    return {
      success: result.success !== false,
      cameraId,
      preset: preset.name,
      position: { pan: pos.pan, tilt: pos.tilt, zoom: pos.zoom },
    };
  },

  async savePreset(cameraId, name) {
    const camera = getCameraById(cameraId);
    if (isRealPtz(camera)) {
      const result = await gw('POST', `/api/ptz/${cameraId}/presets/save`, { name });
      return {
        success: result.success,
        cameraId,
        preset: result.preset || { id: `p${Date.now()}`, name, pan: 0, tilt: 0, zoom: 1.0 },
      };
    }

    const adapter = adapterFor(cameraId);
    const result = await adapter.presetSave(name);
    return {
      success: result.success !== false,
      cameraId,
      preset: result.data,
    };
  },

  async deletePreset(cameraId, presetId) {
    const camera = getCameraById(cameraId);
    if (isRealPtz(camera)) {
      const result = await gw('DELETE', `/api/ptz/${cameraId}/presets/${presetId}`);
      return { success: result.success, cameraId, deletedPresetId: presetId };
    }

    const adapter = adapterFor(cameraId);
    const result = await adapter.presetDelete(presetId);
    return {
      success: result.success !== false,
      cameraId,
      deletedPresetId: presetId,
      ...result,
    };
  },

  async renamePreset(cameraId, presetId, name) {
    const camera = getCameraById(cameraId);
    if (isRealPtz(camera)) {
      return { success: true, cameraId, preset: { id: presetId, name } };
    }

    const adapter = adapterFor(cameraId);
    const result = await adapter.presetRename(presetId, name);
    return {
      success: result.success !== false,
      cameraId,
      preset: result.data,
    };
  },
};

export const ptzUtils = {
  formatPosition(pan, tilt) {
    const panDir = pan >= 0 ? 'R' : 'L';
    const tiltDir = tilt >= 0 ? 'U' : 'D';
    return `P:${Math.abs(pan).toFixed(0)}°${panDir} T:${Math.abs(tilt).toFixed(0)}°${tiltDir}`;
  },

  formatZoom(zoom) {
    return `${zoom.toFixed(1)}x`;
  },

  isAtHome(pan, tilt, zoom) {
    return Math.abs(pan) < 1 && Math.abs(tilt) < 1 && Math.abs(zoom - 1.0) < 0.1;
  },

  isNearEdge(pan, tilt, panRange, tiltRange, threshold = 0.85) {
    const panPct = panRange ? Math.abs(pan) / Math.max(Math.abs(panRange[0]), Math.abs(panRange[1])) : 0;
    const tiltPct = tiltRange ? Math.abs(tilt) / Math.max(Math.abs(tiltRange[0]), Math.abs(tiltRange[1])) : 0;
    return { panNear: panPct > threshold, tiltNear: tiltPct > threshold, panPct, tiltPct };
  },

  getEdgeSlowdownFactor(pan, tilt, panRange, tiltRange) {
    const { panPct, tiltPct } = ptzUtils.isNearEdge(pan, tilt, panRange, tiltRange, 0);
    const maxPct = Math.max(panPct, tiltPct);
    if (maxPct > 0.9) return 0.3;
    if (maxPct > 0.8) return 0.6;
    return 1.0;
  },
};
