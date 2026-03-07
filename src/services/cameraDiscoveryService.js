/**
 * VIPO Vision — Camera Discovery Service
 *
 * Simulates network scanning and camera discovery.
 * Real implementation (Phase 4) will use:
 *   - ONVIF WS-Discovery (UDP 239.255.255.250:3702)
 *   - Port scanning on common camera ports
 *   - UPnP/SSDP discovery
 */

import { GATEWAY_BASE } from '../config.js';

const SCAN_PORTS = [80, 554, 8000, 8899];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const MOCK_DISCOVERED = [
  {
    id: 'disc-001',
    name: 'IP Camera — Front Gate',
    ip: '192.168.1.50',
    port: 554,
    brand: 'Hikvision',
    model: 'DS-2CD2143G2-I',
    rtspUrl: 'rtsp://192.168.1.50:554/Streaming/Channels/101',
    ptzSupported: true,
    zoomSupported: true,
    onvifSupported: true,
    status: 'discovered',
    mac: 'A4:CF:12:8B:3A:01',
    firmware: 'V5.7.1',
  },
  {
    id: 'disc-002',
    name: 'IP Camera — Parking B',
    ip: '192.168.1.51',
    port: 80,
    brand: 'Dahua',
    model: 'IPC-HDW2431T-AS',
    rtspUrl: 'rtsp://192.168.1.51:554/cam/realmonitor?channel=1&subtype=0',
    ptzSupported: false,
    zoomSupported: true,
    onvifSupported: true,
    status: 'discovered',
    mac: 'B0:02:47:6C:EE:12',
    firmware: 'V2.800.0000',
  },
  {
    id: 'disc-003',
    name: 'IP Camera — Warehouse',
    ip: '192.168.1.52',
    port: 8899,
    brand: 'Reolink',
    model: 'RLC-810A',
    rtspUrl: 'rtsp://192.168.1.52:554/h264Preview_01_main',
    ptzSupported: true,
    zoomSupported: true,
    onvifSupported: false,
    status: 'discovered',
    mac: 'EC:71:DB:44:FA:03',
    firmware: 'v3.0.0.183',
  },
  {
    id: 'disc-004',
    name: 'IP Camera — Back Door',
    ip: '192.168.1.53',
    port: 554,
    brand: 'Axis',
    model: 'M3106-L Mk II',
    rtspUrl: 'rtsp://192.168.1.53:554/axis-media/media.amp',
    ptzSupported: false,
    zoomSupported: false,
    onvifSupported: true,
    status: 'discovered',
    mac: 'AC:CC:8E:15:B7:04',
    firmware: '10.12.114',
  },
  {
    id: 'disc-005',
    name: 'IP Camera — Corridor 2F',
    ip: '192.168.1.54',
    port: 8000,
    brand: 'Hikvision',
    model: 'DS-2DE4A425IW-DE',
    rtspUrl: 'rtsp://192.168.1.54:554/Streaming/Channels/101',
    ptzSupported: true,
    zoomSupported: true,
    onvifSupported: true,
    status: 'discovered',
    mac: 'A4:CF:12:8B:3A:05',
    firmware: 'V5.7.3',
  },
];

const STORAGE_KEY = 'vipo_discovered_cameras';
const ADDED_KEY = 'vipo_added_cameras';

function loadFromStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

export const cameraDiscoveryService = {
  /**
   * Simulate a network scan. Returns discovered cameras after a delay.
   * In Phase 4 this will perform actual ONVIF/UPnP discovery.
   */
  async scanLocalNetwork(onProgress) {
    const results = [];
    const totalSteps = SCAN_PORTS.length;

    for (let i = 0; i < totalSteps; i++) {
      if (onProgress) {
        onProgress({
          phase: 'scanning',
          port: SCAN_PORTS[i],
          progress: ((i + 1) / totalSteps) * 100,
          message: `Scanning port ${SCAN_PORTS[i]}...`,
        });
      }
      await delay(600 + Math.random() * 400);
    }

    if (onProgress) {
      onProgress({ phase: 'identifying', progress: 90, message: 'Identifying devices...' });
    }
    await delay(800);

    const count = 3 + Math.floor(Math.random() * 3);
    const shuffled = [...MOCK_DISCOVERED].sort(() => Math.random() - 0.5);
    results.push(...shuffled.slice(0, count));

    if (onProgress) {
      onProgress({ phase: 'done', progress: 100, message: `Found ${results.length} cameras` });
    }

    saveToStorage(STORAGE_KEY, results);
    return results;
  },

  /**
   * Return the mock discovered cameras instantly (for testing).
   */
  mockDiscoverCameras() {
    return [...MOCK_DISCOVERED];
  },

  /**
   * Add a discovered camera to the "added" list in localStorage.
   * Returns the full camera object ready for the dashboard.
   */
  addCamera(cameraData) {
    void cameraData;
    return { success: false, message: 'Local camera store disabled — backend is source of truth' };
  },

  /**
   * Remove a user-added camera from localStorage.
   */
  removeCamera(cameraId) {
    void cameraId;
    return { success: true };
  },

  /**
   * Get all user-added cameras from localStorage.
   */
  getAddedCameras() {
    return [];
  },

  /**
   * Get the last scan results.
   */
  getLastScanResults() {
    return loadFromStorage(STORAGE_KEY);
  },

  /**
   * Test a connection to a camera (mock).
   */
  async testConnection(ip, port, username, password, protocol) {
    await delay(1200 + Math.random() * 800);
    const success = Math.random() > 0.2;
    return {
      success,
      message: success
        ? `Connected to ${ip}:${port} via ${protocol} — stream detected`
        : `Failed to connect to ${ip}:${port} — verify credentials and network`,
      rttMs: success ? Math.floor(Math.random() * 30 + 5) : null,
      streamInfo: success
        ? { resolution: '1920x1080', codec: 'H.264', fps: 25 }
        : null,
    };
  },

  SCAN_PORTS,

  // ─── Backend API Functions (Phase 4) ────────────────────────────

  async apiGetCameras() {
    try {
      const res = await fetch(`${GATEWAY_BASE}/api/cameras`);
      const data = await res.json();
      return data.cameras || [];
    } catch {
      return [];
    }
  },

  async apiAddCamera(cameraData) {
    try {
      const res = await fetch(`${GATEWAY_BASE}/api/cameras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cameraData),
      });
      const data = await res.json();
      // Mirror to localStorage for offline cache
      if (data.success && data.camera) {
        this.addCamera({ ...cameraData, ...data.camera });
      }
      return data;
    } catch {
      // Fallback to localStorage only
      return this.addCamera(cameraData);
    }
  },

  async apiRemoveCamera(cameraId) {
    try {
      await fetch(`${GATEWAY_BASE}/api/cameras/${cameraId}`, { method: 'DELETE' });
    } catch { /* ignore */ }
    // Always remove from localStorage too
    return this.removeCamera(cameraId);
  },

  async apiStartStream(cameraId, mode) {
    const body = { cameraId };
    if (mode) body.mode = mode;
    const res = await fetch(`${GATEWAY_BASE}/api/streams/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  },

  async apiStopStream(cameraId) {
    const res = await fetch(`${GATEWAY_BASE}/api/streams/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cameraId }),
    });
    return res.json();
  },

  async apiStreamStatus(cameraId) {
    try {
      const url = cameraId
        ? `${GATEWAY_BASE}/api/streams/status/${cameraId}`
        : `${GATEWAY_BASE}/api/streams/status`;
      const res = await fetch(url);
      return res.json();
    } catch {
      return cameraId ? { state: 'stopped' } : {};
    }
  },

  // ─── ONVIF Discovery API (Phase 5) ─────────────────────────────

  async apiOnvifScan(timeoutMs = 3000) {
    try {
      const res = await fetch(`${GATEWAY_BASE}/api/discovery/onvif/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs }),
      });
      const data = await res.json();
      return data.success ? (data.devices || []) : [];
    } catch {
      return [];
    }
  },

  async apiOnvifAdd({ ip, xaddr, username, password, name }) {
    const res = await fetch(`${GATEWAY_BASE}/api/discovery/onvif/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, xaddr, username, password, name }),
    });
    return res.json();
  },

  async apiAutoDiscover() {
    try {
      const res = await fetch(`${GATEWAY_BASE}/api/discovery/auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return res.json();
    } catch {
      return { success: false, message: 'Gateway not reachable' };
    }
  },
};
