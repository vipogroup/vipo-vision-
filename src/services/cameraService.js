import { GATEWAY_BASE } from '../config.js';

async function requestJson(path, opts) {
  const res = await fetch(`${GATEWAY_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts && opts.headers ? opts.headers : {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data && data.message ? data.message : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export const cameraService = {
  async fetchCameras() {
    const data = await requestJson('/api/cameras');
    return Array.isArray(data) ? data : (data.cameras || []);
  },

  async addCamera(payload) {
    return requestJson('/api/cameras', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteCamera(cameraId) {
    return requestJson(`/api/cameras/${encodeURIComponent(cameraId)}`, {
      method: 'DELETE',
    });
  },
};
