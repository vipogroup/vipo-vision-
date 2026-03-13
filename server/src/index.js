/**
 * VIPO Vision — Stream Gateway
 *
 * Express server that:
 *   1. Stores camera configs in a JSON file (source of truth for RTSP URLs)
 *   2. Manages FFmpeg RTSP → HLS conversion
 *   3. Serves HLS segments to the frontend
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { cameraStore } from './cameraStore.js';
import { streamManager } from './streamManager.js';
import { sanitizeCamera, log } from './sanitize.js';
import { ptzRouter } from './ptz/ptzRouter.js';
import { discoverOnvifDevices } from './onvif/onvifDiscovery.js';
import { createOnvifClient } from './onvif/onvifClient.js';
import { scanNetwork, probeCloseLiChannels } from './discovery/networkScanner.js';
import { detectUsbCameras } from './discovery/usbDetector.js';
import { getSystemStreamsInfo } from './streamGuard.js';
import { startAutoUpdate, checkForUpdates, getUpdateStatus } from './autoUpdate.js';

const PORT = process.env.GATEWAY_PORT || 5055;
const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

// ─── Static files (built React app + test page) ─────────────────
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', '..', 'dist');
app.use(express.static(distDir, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));
app.use('/test', express.static(path.join(__dirname, '..', 'public')));

// Landing page for new users
const docsDir = path.join(__dirname, '..', '..', 'docs');
app.get('/welcome', (req, res) => {
  res.sendFile(path.join(docsDir, 'index.html'));
});

// ─── HLS Static Files ──────────────────────────────────────────────
app.use('/hls', (req, res, next) => {
  try {
    const parts = (req.path || '').split('/').filter(Boolean);
    const cameraId = parts[0];
    if (cameraId) streamManager.touch(cameraId);
  } catch { /* ignore */ }
  next();
});

app.use('/hls', express.static(streamManager.getHlsRoot(), {
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
  },
}));

// ─── Camera CRUD ────────────────────────────────────────────────────

app.get('/api/cameras', (req, res) => {
  const cameras = cameraStore.getPublicList();
  res.json({ cameras });
});

app.get('/api/cameras/:id', (req, res) => {
  const camera = cameraStore.getById(req.params.id);
  if (!camera) {
    return res.status(404).json({ success: false, message: 'Camera not found' });
  }
  // Strip sensitive fields
  const { password, rtspUrl, httpUrl, onvif, httpCgi, ...safe } = camera;
  res.json(safe);
});

app.post('/api/cameras', (req, res) => {
  try {
    const camera = req.body;
    if (!camera || !camera.ip) {
      return res.status(400).json({ success: false, message: 'IP is required' });
    }
    log('info', 'Adding camera:', sanitizeCamera(camera));
    const result = cameraStore.add(camera);
    res.status(result.success ? 201 : 409).json(result);
  } catch (err) {
    log('error', `POST /api/cameras failed: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.patch('/api/cameras/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = cameraStore.getById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Camera not found' });
    }

    const patch = req.body || {};
    const allowed = {
      name: patch.name,
      location: patch.location,
      group: patch.group,
      ptzSupported: patch.ptzSupported,
      zoomSupported: patch.zoomSupported,
      movementSpeed: patch.movementSpeed,
      maxZoom: patch.maxZoom,
      panRange: patch.panRange,
      tiltRange: patch.tiltRange,
      ptzType: patch.ptzType,
      httpCgi: patch.httpCgi,
      onvif: patch.onvif,
      liveChannel: patch.liveChannel,
    };

    Object.keys(allowed).forEach((k) => {
      if (allowed[k] === undefined) delete allowed[k];
    });

    if (allowed.ptzType && !['none', 'onvif', 'http_cgi'].includes(allowed.ptzType)) {
      return res.status(400).json({ success: false, message: 'Invalid ptzType' });
    }

    if (allowed.httpCgi && typeof allowed.httpCgi !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid httpCgi' });
    }

    const result = cameraStore.update(id, allowed);
    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    log('error', `PATCH /api/cameras failed: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/cameras/:id', (req, res) => {
  const { id } = req.params;
  // Stop any active stream first
  streamManager.stop(id);
  const result = cameraStore.remove(id);
  res.status(result.success ? 200 : 404).json(result);
});

// ─── Stream Control ─────────────────────────────────────────────────

app.post('/api/streams/start', async (req, res) => {
  const { cameraId, mode } = req.body;
  if (!cameraId) {
    return res.status(400).json({ success: false, message: 'cameraId is required' });
  }

  const camera = cameraStore.getById(cameraId);
  if (!camera) {
    return res.status(404).json({ success: false, message: `Camera ${cameraId} not found in store` });
  }

  const desiredMode = camera.brand === 'CloseLi'
    ? ((mode === 'hd' || mode === 'recording') ? 'recording' : 'live')
    : 'default';

  const existing = streamManager.getRawStream(cameraId);
  if (existing && (existing.state === 'running' || existing.state === 'starting' || existing.state === 'streaming' || existing.state === 'buffering')) {
    const existingMode = existing._liveProxy ? 'live' : 'recording';
    if (desiredMode === 'default' || existingMode === desiredMode) {
      streamManager.touch(cameraId);
      return res.json({ success: true, stream: streamManager.getStream(cameraId), message: 'Stream already running' });
    }
    streamManager.stop(cameraId);
  }

  // CloseLi cameras:
  //   TCP port 12345 = real-time 640x360 (fast, reliable) — default for dashboard
  //   HTTP recording  = 1600x960 (slow startup, better quality) — used when mode='hd'
  if (camera.brand === 'CloseLi' && camera.ip && mode !== 'hd' && mode !== 'recording') {
    const liveChannel = camera.liveChannel != null ? camera.liveChannel : 0;
    log('info', `[${cameraId}] Starting CloseLi LIVE stream from ${camera.ip}:12345 channel=${liveChannel}`);
    const result = streamManager.startLive(cameraId, camera.ip, 12345, liveChannel);
    return res.json(result);
  }

  let streamUrl = camera.rtspUrl || camera.httpUrl;
  if (!streamUrl) {
    return res.status(400).json({
      success: false,
      message: `Camera ${cameraId} has no RTSP or HTTP URL configured`,
    });
  }

  // CloseLi cameras (recording mode fallback): resolve actual recording file URL via Telnet
  if (camera.brand === 'CloseLi' && camera.channel && camera.type === 'HTTP') {
    try {
      const { getCloseLiStreamUrl } = await import('./closeli/telnetHelper.js');
      log('info', `[${cameraId}] Resolving CloseLi recording via Telnet (${camera.ip})...`);
      let result = null;
      for (let attempt = 0; attempt < 5 && !result; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 3000));
        result = await getCloseLiStreamUrl(camera.ip, camera.port || 8080, camera.channel);
      }
      if (result) {
        streamUrl = result.url;
        log('info', `[${cameraId}] CloseLi recording: ${result.fname}`);
        streamManager.setCloseLiMeta(cameraId, {
          ip: camera.ip,
          port: camera.port || 8080,
          channel: camera.channel,
          lastFile: result.fname,
        });
      } else {
        log('warn', `[${cameraId}] CloseLi: no recordings found after retries`);
        return res.status(503).json({ success: false, message: 'No recording available yet, try again' });
      }
    } catch (err) {
      log('warn', `[${cameraId}] CloseLi Telnet failed: ${err.message}, using original URL`);
    }
  }

  const result = streamManager.start(cameraId, streamUrl);
  res.json(result);
});

app.post('/api/streams/stop', (req, res) => {
  const { cameraId } = req.body;
  if (!cameraId) {
    return res.status(400).json({ success: false, message: 'cameraId is required' });
  }

  const result = streamManager.stop(cameraId);
  res.json(result);
});

app.get('/api/streams/diagnostics', (req, res) => {
  const diagnostics = streamManager.getDiagnostics();
  res.json({ success: true, count: diagnostics.length, streams: diagnostics });
});

app.get('/api/streams/status', (req, res) => {
  res.json(streamManager.status());
});

app.get('/api/streams/status/:cameraId', (req, res) => {
  const stream = streamManager.getStream(req.params.cameraId);
  res.json(stream || { state: 'stopped' });
});

// ─── Stream Probe (FFprobe) ──────────────────────────────────────

app.get('/api/cameras/:id/probe', async (req, res) => {
  try {
    const camera = cameraStore.getById(req.params.id);
    if (!camera) {
      return res.status(404).json({ success: false, message: 'Camera not found' });
    }

    const stream = streamManager.getRawStream(req.params.id);
    const hlsPath = stream?.playlistPath;

    // Camera hardware info (from store)
    const hardware = {
      brand: camera.brand || 'Unknown',
      model: camera.model || 'Unknown',
      ip: camera.ip,
      port: camera.port,
      type: camera.type,
      configuredResolution: camera.resolution || 'Unknown',
      configuredFps: camera.fps || 0,
      configuredCodec: camera.codec || 'Unknown',
    };

    // If no active stream or no playlist, return hardware only
    if (!hlsPath || !stream || stream.state !== 'running') {
      return res.json({
        success: true,
        hardware,
        stream: null,
        message: 'No active stream to probe',
      });
    }

    // Run FFprobe on the HLS playlist
    const { execSync } = await import('child_process');
    const cmd = `ffprobe -v quiet -print_format json -show_streams -show_format "${hlsPath}"`;
    const output = execSync(cmd, { timeout: 10000 }).toString();
    const probe = JSON.parse(output);

    const videoStream = (probe.streams || []).find(s => s.codec_type === 'video');
    const quality = videoStream ? {
      width: videoStream.width,
      height: videoStream.height,
      codec: videoStream.codec_name,
      profile: videoStream.profile,
      fps: videoStream.r_frame_rate,
      bitrate: videoStream.bit_rate ? `${Math.round(videoStream.bit_rate / 1000)}kbps` : (probe.format?.bit_rate ? `${Math.round(probe.format.bit_rate / 1000)}kbps` : 'N/A'),
      pixelFormat: videoStream.pix_fmt,
      level: videoStream.level,
    } : null;

    res.json({
      success: true,
      hardware,
      stream: {
        state: stream.state,
        mode: stream.mode || 'unknown',
        sourceType: stream.sourceType || 'unknown',
        startedAt: stream.startedAt,
        uptime: Math.round((Date.now() - new Date(stream.startedAt).getTime()) / 1000),
      },
      quality,
    });
  } catch (err) {
    log('error', `Probe failed for ${req.params.id}: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Recording to Local Disk ─────────────────────────────────────

app.post('/api/recordings/start', async (req, res) => {
  const { cameraId } = req.body;
  if (!cameraId) {
    return res.status(400).json({ success: false, message: 'cameraId is required' });
  }
  const camera = cameraStore.getById(cameraId);
  if (!camera) {
    return res.status(404).json({ success: false, message: `Camera ${cameraId} not found` });
  }

  let recordUrl = camera.rtspUrl || camera.httpUrl;

  // CloseLi: resolve live URL via Telnet
  if (camera.brand === 'CloseLi' && camera.channel && camera.type === 'HTTP') {
    try {
      const { getCloseLiStreamUrl } = await import('./closeli/telnetHelper.js');
      const recResult = await getCloseLiStreamUrl(camera.ip, camera.port || 8080, camera.channel);
      if (recResult) {
        recordUrl = recResult.url;
        streamManager.setCloseLiMeta(cameraId, { ip: camera.ip, port: camera.port || 8080, channel: camera.channel, lastFile: recResult.fname });
      }
    } catch { /* use original */ }
  }

  const result = streamManager.startRecording(cameraId, recordUrl, camera.name);
  res.json(result);
});

app.post('/api/recordings/stop', (req, res) => {
  const { cameraId } = req.body;
  if (!cameraId) {
    return res.status(400).json({ success: false, message: 'cameraId is required' });
  }
  const result = streamManager.stopRecording(cameraId);
  res.json(result);
});

app.get('/api/recordings/status', (req, res) => {
  res.json(streamManager.getAllRecordingStatus());
});

app.get('/api/recordings/status/:cameraId', (req, res) => {
  const rec = streamManager.getRecordingStatus(req.params.cameraId);
  res.json(rec || { state: 'stopped' });
});

app.get('/api/recordings/files', (req, res) => {
  const dir = streamManager.getRecordingsRoot();
  if (!fs.existsSync(dir)) {
    return res.json({ files: [] });
  }
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.mp4'))
    .map(f => {
      const stat = fs.statSync(path.join(dir, f));
      return { name: f, size: stat.size, created: stat.birthtime };
    })
    .sort((a, b) => new Date(b.created) - new Date(a.created));
  res.json({ files });
});

// ─── PTZ Control ────────────────────────────────────────────────────
app.use('/api/ptz', ptzRouter);

// ─── ONVIF Discovery ────────────────────────────────────────────────

app.post('/api/discovery/onvif/scan', async (req, res) => {
  const { timeoutMs } = req.body || {};
  try {
    const devices = await discoverOnvifDevices({ timeoutMs: timeoutMs || 3000 });
    res.json({ success: true, devices });
  } catch (err) {
    log('error', `ONVIF scan error: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/discovery/onvif/add', async (req, res) => {
  const { ip, xaddr, username, password, name } = req.body;
  if (!ip || !xaddr) {
    return res.status(400).json({ success: false, message: 'ip and xaddr are required' });
  }

  try {
    log('info', `Adding ONVIF camera at ${ip}...`);
    const client = await createOnvifClient({ xaddr, username: username || '', password: password || '' });

    // Get profiles
    const profiles = await client.getProfiles();
    if (!profiles.length) {
      return res.status(400).json({ success: false, message: 'No media profiles found on camera' });
    }

    // Prefer H264 profile
    const h264Profile = profiles.find((p) => p.videoEncoding?.toLowerCase().includes('h264'));
    const profile = h264Profile || profiles[0];

    // Get RTSP stream URI
    let rtspUrl = '';
    try {
      rtspUrl = await client.getStreamUri(profile.token);
    } catch (e) {
      log('warn', `Could not get stream URI: ${e.message}`);
    }

    // Build camera entry
    const cameraData = {
      id: `onvif-${ip.replace(/\./g, '-')}-${Date.now()}`,
      name: name || `ONVIF Camera (${ip})`,
      type: 'ONVIF',
      ip,
      port: 80,
      username: username || '',
      password: password || '',
      rtspUrl,
      status: 'online',
      recording: false,
      resolution: profile.resolution || '1920x1080',
      fps: 25,
      codec: profile.videoEncoding || 'H.264',
      location: '',
      group: 'ONVIF',
      ptzSupported: profile.ptzSupported || false,
      zoomSupported: profile.ptzSupported || false,
      onvifSupported: true,
      brand: 'ONVIF',
      model: 'Auto-detected',
      ptzType: profile.ptzSupported ? 'onvif' : 'none',
      onvif: {
        xaddr,
        profileToken: profile.token,
      },
      presets: [],
      movementSpeed: 5,
      zoomLevel: 1.0,
      maxZoom: profile.ptzSupported ? 20 : 1,
      panRange: profile.ptzSupported ? [-180, 180] : [0, 0],
      tiltRange: profile.ptzSupported ? [-90, 45] : [0, 0],
    };

    const result = cameraStore.add(cameraData);
    res.status(result.success ? 201 : 409).json(result);
  } catch (err) {
    log('error', `ONVIF add error: ${err.message}`);
    res.status(500).json({ success: false, message: `Failed to connect: ${err.message}` });
  }
});

// ─── Auto Discovery (Network + ONVIF + USB) ─────────────────────────

app.post('/api/discovery/auto', async (req, res) => {
  log('info', 'Starting auto-discovery (network scan + ONVIF + USB)...');

  const results = {
    network: [],
    onvif: [],
    usb: [],
    added: [],
    alreadyExists: [],
    errors: [],
  };

  // 1) USB cameras
  try {
    const usbCams = detectUsbCameras();
    results.usb = usbCams;
    for (const usb of usbCams) {
      const id = `usb-${usb.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
      if (cameraStore.getById(id)) {
        results.alreadyExists.push(id);
        continue;
      }
      const addResult = cameraStore.add({
        id,
        name: usb.name,
        type: 'USB',
        ip: 'localhost',
        port: 0,
        username: '',
        password: '',
        rtspUrl: '',
        httpUrl: '',
        status: 'online',
        recording: false,
        resolution: '1920x1080',
        fps: 30,
        codec: 'MJPEG',
        location: 'Local USB',
        group: 'USB',
        ptzSupported: false,
        zoomSupported: false,
        onvifSupported: false,
        brand: 'USB Webcam',
        model: usb.name,
        ptzType: 'none',
      });
      if (addResult.success) results.added.push(addResult.camera);
    }
  } catch (err) {
    results.errors.push(`USB detection: ${err.message}`);
    log('error', `USB detection error: ${err.message}`);
  }

  // 2) ONVIF WS-Discovery
  try {
    const onvifDevices = await discoverOnvifDevices({ timeoutMs: 3000 });
    results.onvif = onvifDevices;
  } catch (err) {
    results.errors.push(`ONVIF scan: ${err.message}`);
    log('error', `ONVIF scan error: ${err.message}`);
  }

  // 3) Network port scan
  try {
    const networkDevices = await scanNetwork();
    results.network = networkDevices;

    for (const dev of networkDevices) {
      // Check if already in store by IP
      const existing = cameraStore.getAll().find((c) => c.ip === dev.ip);
      if (existing) {
        results.alreadyExists.push(existing.id);
        continue;
      }

      // CloseLi cameras — detect channels
      if (dev.brand === 'CloseLi' && dev.ports.includes(8080)) {
        try {
          const channels = await probeCloseLiChannels(dev.ip, 8080);
          if (channels.length > 0) {
            for (let i = 0; i < channels.length; i++) {
              const ch = channels[i];
              const chId = `closeli-${dev.ip.replace(/\./g, '-')}-ch${i + 1}`;
              if (cameraStore.getById(chId)) {
                results.alreadyExists.push(chId);
                continue;
              }
              const addResult = cameraStore.add({
                id: chId,
                name: `${dev.name} CH${i + 1}`,
                type: 'HTTP',
                ip: dev.ip,
                port: 8080,
                username: 'root',
                password: '',
                rtspUrl: '',
                httpUrl: ch.httpUrl,
                channel: ch.channel,
                status: 'online',
                recording: true,
                resolution: '1600x960',
                fps: 8,
                codec: 'H.264',
                location: `CloseLi Camera — Channel ${i + 1}`,
                group: 'CloseLi',
                ptzSupported: true,
                zoomSupported: true,
                onvifSupported: false,
                brand: 'CloseLi',
                model: 'Ingenic T23 + GC2083',
                ptzType: 'http_cgi',
                httpCgi: { templateName: 'hi3510', baseUrl: `http://${dev.ip}:8080/${ch.channel}` },
                movementSpeed: 5,
                maxZoom: 5,
                panRange: [-180, 180],
                tiltRange: [-90, 45],
              });
              if (addResult.success) results.added.push(addResult.camera);
            }
            continue;
          }
        } catch (err) {
          log('warn', `CloseLi channel probe failed for ${dev.ip}: ${err.message}`);
        }
      }

      // Generic cameras with RTSP
      if (dev.rtspUrl) {
        const id = `net-${dev.ip.replace(/\./g, '-')}-${Date.now()}`;
        const addResult = cameraStore.add({
          id,
          name: dev.name,
          type: dev.type,
          ip: dev.ip,
          port: dev.ports[0] || 554,
          username: '',
          password: '',
          rtspUrl: dev.rtspUrl,
          httpUrl: dev.httpUrl || '',
          status: 'online',
          recording: false,
          resolution: '1920x1080',
          fps: 25,
          codec: 'H.264',
          location: '',
          group: dev.brand !== 'Unknown' ? dev.brand : 'Discovered',
          ptzSupported: dev.ptzSupported,
          zoomSupported: dev.ptzSupported,
          onvifSupported: dev.onvifSupported,
          brand: dev.brand,
          model: dev.model,
          ptzType: dev.ptzSupported && dev.onvifSupported ? 'onvif' : 'none',
        });
        if (addResult.success) results.added.push(addResult.camera);
      }
    }
  } catch (err) {
    results.errors.push(`Network scan: ${err.message}`);
    log('error', `Network scan error: ${err.message}`);
  }

  log('info', `Auto-discovery complete: ${results.added.length} added, ${results.alreadyExists.length} already existed`);

  res.json({
    success: true,
    summary: {
      usbFound: results.usb.length,
      onvifFound: results.onvif.length,
      networkFound: results.network.length,
      added: results.added.length,
      alreadyExists: results.alreadyExists.length,
    },
    added: results.added,
    usb: results.usb,
    onvif: results.onvif,
    network: results.network,
    errors: results.errors,
  });
});

// ─── System Streams (StreamGuard) ─────────────────────────────────

app.get('/api/system/streams', (req, res) => {
  const info = getSystemStreamsInfo();
  res.json({ success: true, ...info });
});

app.get('/api/metrics', (req, res) => {
  const streams = streamManager.status();
  const recordings = streamManager.getAllRecordingStatus();

  const streamList = Object.values(streams || {});
  const recordingList = Object.values(recordings || {});

  const streamCounts = {
    total: streamList.length,
    running: streamList.filter((s) => s.state === 'running').length,
    starting: streamList.filter((s) => s.state === 'starting').length,
    error: streamList.filter((s) => s.state === 'error').length,
  };

  const recordingCounts = {
    total: recordingList.length,
    recording: recordingList.filter((r) => r.state === 'recording').length,
    stopped: recordingList.filter((r) => r.state === 'stopped').length,
    error: recordingList.filter((r) => r.state === 'error').length,
  };

  res.json({
    ok: true,
    at: new Date().toISOString(),
    process: {
      pid: process.pid,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      uptimeSec: Math.round(process.uptime()),
      memory: process.memoryUsage(),
    },
    os: {
      hostname: os.hostname(),
      uptimeSec: os.uptime(),
      totalMemBytes: os.totalmem(),
      freeMemBytes: os.freemem(),
      cpuCount: os.cpus()?.length || 0,
      loadavg: os.loadavg(),
    },
    streams: {
      counts: streamCounts,
      items: streamList,
    },
    recordings: {
      counts: recordingCounts,
      items: recordingList,
    },
  });
});

// ─── Auto Update ────────────────────────────────────────────────────

app.get('/api/update/status', (req, res) => {
  res.json({ success: true, ...getUpdateStatus() });
});

app.post('/api/update/check', (req, res) => {
  const result = checkForUpdates();
  res.json({ success: true, ...result });
});

// ─── Health ─────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), streams: Object.keys(streamManager.status()).length });
});

// ─── Graceful Shutdown ──────────────────────────────────────────────

function shutdown() {
  log('info', 'Shutting down — stopping all streams...');
  streamManager.stopAll();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ─── Start ──────────────────────────────────────────────────────────

// ─── Auto-seed CloseLi cameras ──────────────────────────────────────

const CLOSELI_SEED = [
  { id: 'cam-001', name: 'CloseLi CH1', channel: 'xxxxS_aa3842e77c14',   liveChannel: 0, httpUrl: 'http://10.0.0.9:8080/xxxxS_aa3842e77c14/rawdata/' },
  { id: 'cam-002', name: 'CloseLi CH2', channel: 'xxxxS_aa3842e77c14_1', liveChannel: 1, httpUrl: 'http://10.0.0.9:8080/xxxxS_aa3842e77c14_1/rawdata/' },
  { id: 'cam-003', name: 'CloseLi CH3', channel: 'xxxxS_aa3842e77c14_2', liveChannel: 2, httpUrl: 'http://10.0.0.9:8080/xxxxS_aa3842e77c14_2/rawdata/' },
  { id: 'cam-004', name: 'CloseLi CH4', channel: 'xxxxS_aa3842e77c14_3', liveChannel: 3, httpUrl: 'http://10.0.0.9:8080/xxxxS_aa3842e77c14_3/rawdata/' },
];

function seedCloseLiCameras() {
  let added = 0;
  for (const seed of CLOSELI_SEED) {
    if (cameraStore.getById(seed.id)) continue;
    cameraStore.add({
      ...seed,
      type: 'HTTP',
      ip: '10.0.0.9',
      port: 8080,
      username: 'root',
      password: '',
      rtspUrl: '',
      status: 'online',
      recording: true,
      resolution: '1600x960',
      fps: 8,
      codec: 'H.264',
      location: `CloseLi Camera — Channel ${seed.id.slice(-1)}`,
      group: 'CloseLi',
      ptzSupported: false,
      zoomSupported: false,
      onvifSupported: false,
      brand: 'CloseLi',
      model: 'Ingenic T23 + GC2083',
      ptzType: 'none',
    });
    added++;
  }
  if (added > 0) log('info', `Auto-seeded ${added} CloseLi camera(s)`);
}

// SPA catch-all — serve index.html for client-side routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/hls') || req.path.startsWith('/test')) {
    return next();
  }
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, () => {
  log('info', `VIPO Vision Gateway running on http://localhost:${PORT}`);
  log('info', `HLS files served from ${streamManager.getHlsRoot()}`);

  seedCloseLiCameras();

  const cameras = cameraStore.getAll();
  log('info', `${cameras.length} camera(s) in store`);

  // Start auto-update checker
  startAutoUpdate();
});
