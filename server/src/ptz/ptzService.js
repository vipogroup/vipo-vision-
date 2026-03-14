/**
 * VIPO Vision — PTZ Service
 *
 * Chooses the correct adapter (ONVIF or HTTP CGI) based on camera config,
 * maps UI directions to adapter calls, and tracks last-move state.
 */

import { onvifAdapter } from './adapters/onvifAdapter.js';
import { httpCgiAdapter } from './adapters/httpCgiAdapter.js';
import { telnetMotorAdapter } from './adapters/telnetMotorAdapter.js';
import { log } from '../sanitize.js';

const lastMove = new Map();

function getAdapter(camera) {
  const ptzType = camera.ptzType || 'none';
  switch (ptzType) {
    case 'onvif':
      return onvifAdapter;
    case 'http_cgi':
      return httpCgiAdapter;
    case 'closeli-motor':
      return telnetMotorAdapter;
    default:
      return null;
  }
}

export const ptzService = {
  async move(camera, direction, speed) {
    const adapter = getAdapter(camera);
    if (!adapter) throw new Error(`PTZ not available for camera ${camera.id} (ptzType=${camera.ptzType})`);

    await adapter.move(camera, direction, speed);
    lastMove.set(camera.id, { direction, time: Date.now() });
  },

  async stop(camera) {
    const adapter = getAdapter(camera);
    if (!adapter) throw new Error(`PTZ not available for camera ${camera.id}`);

    await adapter.stop(camera);
    lastMove.delete(camera.id);
  },

  async zoom(camera, mode, value) {
    const adapter = getAdapter(camera);
    if (!adapter) throw new Error(`PTZ not available for camera ${camera.id}`);

    await adapter.zoom(camera, mode, value);
  },

  async getPresets(camera) {
    const adapter = getAdapter(camera);
    if (!adapter) return [];

    try {
      return await adapter.getPresets(camera);
    } catch (err) {
      log('warn', `[${camera.id}] getPresets failed: ${err.message}`);
      return [];
    }
  },

  async gotoPreset(camera, presetId) {
    const adapter = getAdapter(camera);
    if (!adapter) throw new Error(`PTZ not available for camera ${camera.id}`);

    await adapter.gotoPreset(camera, presetId);
  },

  async savePreset(camera, name) {
    const adapter = getAdapter(camera);
    if (!adapter) throw new Error(`PTZ not available for camera ${camera.id}`);

    return await adapter.savePreset(camera, name);
  },

  async deletePreset(camera, presetId) {
    const adapter = getAdapter(camera);
    if (!adapter) throw new Error(`PTZ not available for camera ${camera.id}`);

    await adapter.deletePreset(camera, presetId);
  },

  async getStatus(camera) {
    const adapter = getAdapter(camera);
    if (!adapter) throw new Error(`PTZ not available for camera ${camera.id}`);
    if (typeof adapter.getStatus !== 'function') {
      return { pan: 0, tilt: 0, zoom: 0, adapter: camera.ptzType || 'unknown' };
    }
    return await adapter.getStatus(camera);
  },

  getLastMove(cameraId) {
    return lastMove.get(cameraId) || null;
  },

  isPtzAvailable(camera) {
    return getAdapter(camera) !== null;
  },
};
