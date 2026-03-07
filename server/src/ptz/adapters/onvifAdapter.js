/**
 * VIPO Vision — ONVIF PTZ Adapter
 *
 * Bridges the PTZ service interface to real ONVIF camera PTZ operations.
 * Maintains a cached ONVIF client per camera.
 */

import { createOnvifClient } from '../../onvif/onvifClient.js';
import { log } from '../../sanitize.js';

const clients = new Map();

async function getClient(camera) {
  const key = camera.id;
  if (clients.has(key)) return clients.get(key);

  const xaddr = camera.onvif?.xaddr;
  if (!xaddr) throw new Error(`No ONVIF xaddr for camera ${camera.id}`);

  const client = await createOnvifClient({
    xaddr,
    username: camera.username || '',
    password: camera.password || '',
  });

  clients.set(key, client);
  return client;
}

function getProfileToken(camera) {
  return camera.onvif?.profileToken || 'Profile_1';
}

const DIRECTION_MAP = {
  up:    { x:  0,   y:  1,   zoom: 0 },
  down:  { x:  0,   y: -1,   zoom: 0 },
  left:  { x: -1,   y:  0,   zoom: 0 },
  right: { x:  1,   y:  0,   zoom: 0 },
};

export const onvifAdapter = {
  async move(camera, direction, speed = 0.5) {
    const client = await getClient(camera);
    const profileToken = getProfileToken(camera);
    const vec = DIRECTION_MAP[direction];
    if (!vec) throw new Error(`Unknown direction: ${direction}`);

    const scaledSpeed = Math.min(Math.max(speed / 10, 0.05), 1.0);

    await client.continuousMove({
      profileToken,
      x: vec.x * scaledSpeed,
      y: vec.y * scaledSpeed,
      zoom: 0,
    });
    log('info', `[${camera.id}] ONVIF move ${direction} speed=${scaledSpeed.toFixed(2)}`);
  },

  async stop(camera) {
    const client = await getClient(camera);
    const profileToken = getProfileToken(camera);
    await client.stop({ profileToken });
    log('info', `[${camera.id}] ONVIF stop`);
  },

  async zoom(camera, mode, value) {
    const client = await getClient(camera);
    const profileToken = getProfileToken(camera);

    let zoomVal = 0;
    if (mode === 'in') zoomVal = 0.3;
    else if (mode === 'out') zoomVal = -0.3;
    else if (mode === 'set') zoomVal = 0;

    if (mode === 'stop') {
      await client.stop({ profileToken, panTilt: false, zoom: true });
    } else {
      await client.continuousMove({
        profileToken,
        x: 0,
        y: 0,
        zoom: zoomVal,
      });
    }
    log('info', `[${camera.id}] ONVIF zoom ${mode}`);
  },

  async getPresets(camera) {
    const client = await getClient(camera);
    const profileToken = getProfileToken(camera);
    const presets = await client.getPresets({ profileToken });
    return presets.map((p) => ({
      id: p.token,
      name: p.name,
    }));
  },

  async gotoPreset(camera, presetId) {
    const client = await getClient(camera);
    const profileToken = getProfileToken(camera);
    await client.gotoPreset({ profileToken, presetToken: presetId });
    log('info', `[${camera.id}] ONVIF goto preset ${presetId}`);
  },

  async savePreset(camera, name) {
    const client = await getClient(camera);
    const profileToken = getProfileToken(camera);
    const result = await client.setPreset({ profileToken, name });
    log('info', `[${camera.id}] ONVIF saved preset "${name}" => ${result.token}`);
    return { id: result.token, name };
  },

  async deletePreset(camera, presetId) {
    const client = await getClient(camera);
    const profileToken = getProfileToken(camera);
    await client.removePreset({ profileToken, presetToken: presetId });
    log('info', `[${camera.id}] ONVIF deleted preset ${presetId}`);
  },

  clearClient(cameraId) {
    clients.delete(cameraId);
  },
};
