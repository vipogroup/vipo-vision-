/**
 * VIPO Vision — Mock Camera Adapter
 *
 * Implements the full CameraAdapter interface using in-memory state
 * and simulated delays. Used for development and demo purposes.
 */

import { ok, fail, AdapterError, ConnectionStatus, Capability, Direction } from './types';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function createMockAdapter(cameraConfig = {}) {
  const state = {
    connected: false,
    pan: 0,
    tilt: 0,
    zoom: 1.0,
    speed: cameraConfig.movementSpeed || 5,
    isMoving: false,
    lastCommand: null,
    presets: [...(cameraConfig.presets || [])],
    panRange: cameraConfig.panRange || [-180, 180],
    tiltRange: cameraConfig.tiltRange || [-90, 45],
    maxZoom: cameraConfig.maxZoom || 20,
    rttMs: 12,
  };

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  const randomRtt = () => Math.floor(Math.random() * 30 + 5);

  return {
    // ─── Connection ──────────────────────────────────

    async connect() {
      await delay(300);
      state.connected = true;
      state.rttMs = randomRtt();
      return ok({ status: ConnectionStatus.CONNECTED, rttMs: state.rttMs });
    },

    async disconnect() {
      await delay(100);
      state.connected = false;
      state.isMoving = false;
      return ok({ status: ConnectionStatus.DISCONNECTED });
    },

    async getStatus() {
      await delay(50);
      state.rttMs = randomRtt();
      return {
        status: state.connected ? ConnectionStatus.CONNECTED : ConnectionStatus.DISCONNECTED,
        rttMs: state.rttMs,
        position: { pan: state.pan, tilt: state.tilt, zoom: state.zoom },
        isMoving: state.isMoving,
      };
    },

    getCapabilities() {
      const caps = [Capability.ZOOM_DIGITAL, Capability.PRESETS, Capability.HOME_POSITION];
      if (cameraConfig.ptzSupported) {
        caps.push(Capability.PTZ_MOVE, Capability.PTZ_CONTINUOUS, Capability.PTZ_RELATIVE);
      }
      if (cameraConfig.zoomSupported) {
        caps.push(Capability.ZOOM_OPTICAL);
      }
      return caps;
    },

    // ─── PTZ Movement ────────────────────────────────

    async ptzMove(direction, speed = 5) {
      if (!cameraConfig.ptzSupported) return fail(AdapterError.NOT_SUPPORTED, 'PTZ not supported');
      await delay(80);
      const step = speed * 2;
      state.isMoving = true;
      state.lastCommand = direction;

      switch (direction) {
        case Direction.UP:
          state.tilt = clamp(state.tilt + step, state.tiltRange[0], state.tiltRange[1]);
          break;
        case Direction.DOWN:
          state.tilt = clamp(state.tilt - step, state.tiltRange[0], state.tiltRange[1]);
          break;
        case Direction.LEFT:
          state.pan = clamp(state.pan - step, state.panRange[0], state.panRange[1]);
          break;
        case Direction.RIGHT:
          state.pan = clamp(state.pan + step, state.panRange[0], state.panRange[1]);
          break;
        default:
          break;
      }

      return ok({ pan: state.pan, tilt: state.tilt, speed });
    },

    async ptzStop() {
      await delay(30);
      state.isMoving = false;
      state.lastCommand = 'stop';
      return ok({ pan: state.pan, tilt: state.tilt });
    },

    async ptzHome() {
      await delay(600);
      state.pan = 0;
      state.tilt = 0;
      state.zoom = 1.0;
      state.isMoving = false;
      return ok({ pan: 0, tilt: 0, zoom: 1.0 });
    },

    async ptzGetPosition() {
      await delay(30);
      return { pan: state.pan, tilt: state.tilt, zoom: state.zoom };
    },

    // ─── Zoom ────────────────────────────────────────

    async zoomSet(level) {
      if (!cameraConfig.zoomSupported) return fail(AdapterError.NOT_SUPPORTED, 'Zoom not supported');
      await delay(150);
      state.zoom = clamp(level, 1.0, state.maxZoom);
      return ok({ zoom: state.zoom });
    },

    async zoomIn(step = 1.0) {
      if (!cameraConfig.zoomSupported) return fail(AdapterError.NOT_SUPPORTED);
      await delay(120);
      state.zoom = clamp(state.zoom + step, 1.0, state.maxZoom);
      return ok({ zoom: state.zoom });
    },

    async zoomOut(step = 1.0) {
      if (!cameraConfig.zoomSupported) return fail(AdapterError.NOT_SUPPORTED);
      await delay(120);
      state.zoom = clamp(state.zoom - step, 1.0, state.maxZoom);
      return ok({ zoom: state.zoom });
    },

    // ─── Presets ─────────────────────────────────────

    async presetsList() {
      await delay(50);
      return [...state.presets];
    },

    async presetGo(id) {
      const preset = state.presets.find((p) => p.id === id);
      if (!preset) return fail(AdapterError.UNKNOWN, 'Preset not found');
      await delay(700);
      state.pan = preset.pan;
      state.tilt = preset.tilt;
      state.zoom = preset.zoom;
      return ok({ pan: state.pan, tilt: state.tilt, zoom: state.zoom, name: preset.name });
    },

    async presetSave(name) {
      await delay(400);
      const newPreset = {
        id: `p${Date.now()}`,
        name,
        pan: state.pan,
        tilt: state.tilt,
        zoom: state.zoom,
      };
      state.presets.push(newPreset);
      return ok(newPreset);
    },

    async presetDelete(id) {
      await delay(200);
      const idx = state.presets.findIndex((p) => p.id === id);
      if (idx === -1) return fail(AdapterError.UNKNOWN, 'Preset not found');
      state.presets.splice(idx, 1);
      return ok({ deletedId: id });
    },

    async presetRename(id, name) {
      await delay(150);
      const preset = state.presets.find((p) => p.id === id);
      if (!preset) return fail(AdapterError.UNKNOWN, 'Preset not found');
      preset.name = name;
      return ok(preset);
    },
  };
}
