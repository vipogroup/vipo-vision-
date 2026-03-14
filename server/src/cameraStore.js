/**
 * VIPO Vision — Camera Store
 *
 * Lightweight JSON file-based camera storage.
 * Source of truth for camera RTSP URLs (never sent to frontend).
 */

import fs from 'fs';
import path from 'path';
import { log } from './sanitize.js';

const DATA_DIR = path.resolve('data');
const CAMERAS_FILE = path.join(DATA_DIR, 'cameras.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readAll() {
  ensureDataDir();
  if (!fs.existsSync(CAMERAS_FILE)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(CAMERAS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    log('error', `Failed to read cameras file: ${err.message}`);
    return [];
  }
}

function writeAll(cameras) {
  ensureDataDir();
  fs.writeFileSync(CAMERAS_FILE, JSON.stringify(cameras, null, 2), 'utf-8');
}

export const cameraStore = {
  getAll() {
    return readAll();
  },

  getPublicList() {
    return readAll().map(stripSensitive);
  },

  getById(id) {
    return readAll().find((c) => c.id === id) || null;
  },

  add(camera) {
    const cameras = readAll();
    const existing = cameras.find((c) => c.id === camera.id);
    if (existing) {
      return { success: false, message: 'Camera ID already exists' };
    }

    const entry = {
      id: camera.id || `cam-${Date.now()}`,
      name: camera.name || `Camera ${camera.ip}`,
      type: camera.type || 'RTSP',
      ip: camera.ip,
      port: parseInt(camera.port, 10) || 554,
      username: camera.username || '',
      password: camera.password || '',
      rtspUrl: camera.rtspUrl || '',
      httpUrl: camera.httpUrl || '',
      channel: camera.channel || '',
      status: camera.status || 'online',
      recording: camera.recording ?? false,
      resolution: camera.resolution || '1920x1080',
      fps: camera.fps || 25,
      codec: camera.codec || 'H.264',
      location: camera.location || '',
      group: camera.group || 'Default',
      ptzSupported: camera.ptzSupported ?? false,
      zoomSupported: camera.zoomSupported ?? false,
      onvifSupported: camera.onvifSupported ?? false,
      brand: camera.brand || 'Unknown',
      model: camera.model || 'Unknown',
      presets: camera.presets || [],
      movementSpeed: camera.movementSpeed || 0,
      zoomLevel: camera.zoomLevel || 1.0,
      maxZoom: camera.maxZoom || 1,
      panRange: camera.panRange || [0, 0],
      tiltRange: camera.tiltRange || [0, 0],
      ptzType: camera.ptzType || 'none',
      onvif: camera.onvif || null,
      httpCgi: camera.httpCgi || null,
      motorConfig: camera.motorConfig || null,
      liveChannel: camera.liveChannel ?? null,
      addedAt: new Date().toISOString(),
    };

    cameras.push(entry);
    writeAll(cameras);
    log('info', `Camera added: ${entry.id} (${entry.name})`);

    return { success: true, camera: stripSensitive(entry) };
  },

  update(id, updates) {
    const cameras = readAll();
    const idx = cameras.findIndex((c) => c.id === id);
    if (idx === -1) {
      return { success: false, message: 'Camera not found' };
    }

    cameras[idx] = { ...cameras[idx], ...updates };
    writeAll(cameras);

    return { success: true, camera: stripSensitive(cameras[idx]) };
  },

  remove(id) {
    const cameras = readAll();
    const filtered = cameras.filter((c) => c.id !== id);
    if (filtered.length === cameras.length) {
      return { success: false, message: 'Camera not found' };
    }
    writeAll(filtered);
    log('info', `Camera removed: ${id}`);

    return { success: true };
  },
};

function stripSensitive(cam) {
  const copy = { ...cam };
  delete copy.password;
  delete copy.rtspUrl;
  delete copy.username;
  return copy;
}
