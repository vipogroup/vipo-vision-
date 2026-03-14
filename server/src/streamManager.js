/**
 * VIPO Vision — Stream Manager
 *
 * Manages FFmpeg processes that convert RTSP/HTTP → HLS.
 * Supports:
 *   - RTSP streams (standard IP cameras)
 *   - HTTP raw streams (e.g. CloseLi cameras serving raw H.264 over HTTP)
 * Strategy: try codec copy first (low CPU), fallback to h264 transcode if it fails.
 */

import { spawn } from 'child_process';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { sanitizeUrl, log } from './sanitize.js';
import { startLiveStream } from './streaming/liveStreamProxy.js';
import { detectNvenc, isNvencAvailable, getRtspTranscodeArgs, getHttpTranscodeArgs, getRecordingArgs } from './gpuDetect.js';
import { canStartStream, registerProcess, unregisterProcess, resetRestartCount, initStreamGuard } from './streamGuard.js';

// Detect NVENC on module load
detectNvenc();

const HLS_ROOT = path.resolve('hls');
const RECORDINGS_ROOT = path.resolve(process.env.RECORDINGS_PATH || 'recordings');

// ─── Continuous Auto-Recording ───────────────────────────────────
const AUTO_RECORD_ENABLED = (process.env.AUTO_RECORD || 'true') !== 'false';
const AUTO_RECORD_SEGMENT_SEC = Number(process.env.AUTO_RECORD_SEGMENT_SEC || 900); // 15 min
const AUTO_RECORD_RETENTION_DAYS = Number(process.env.AUTO_RECORD_RETENTION_DAYS || 7);
const activeStreams = new Map();
const activeRecordings = new Map(); // cameraId → { process, filePath, startedAt }
const closeLiMeta = new Map(); // cameraId → { ip, port, channel, lastFile } for auto-restart

// ─── MediaMTX WebRTC integration ─────────────────────────────────
const MEDIAMTX_RTSP_URL = process.env.MEDIAMTX_RTSP_URL || 'rtsp://127.0.0.1:8554';
const MEDIAMTX_RTSP_PORT = Number(process.env.MEDIAMTX_RTSP_PORT || 8554);
let mediaMtxAvailable = false;

function checkMediaMtx() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.connect(MEDIAMTX_RTSP_PORT, '127.0.0.1');
  });
}

// Check MediaMTX availability on startup and periodically
(async () => {
  mediaMtxAvailable = await checkMediaMtx();
  log('info', `[MediaMTX] WebRTC relay ${mediaMtxAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'} at ${MEDIAMTX_RTSP_URL}`);
})();
const _mtxCheckTimer = setInterval(async () => {
  const was = mediaMtxAvailable;
  mediaMtxAvailable = await checkMediaMtx();
  if (was !== mediaMtxAvailable) {
    log('info', `[MediaMTX] WebRTC relay ${mediaMtxAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}`);
  }
}, 30_000);
if (typeof _mtxCheckTimer.unref === 'function') _mtxCheckTimer.unref();

const STREAM_IDLE_TTL_LIVE_MS = Number(process.env.STREAM_IDLE_TTL_LIVE_MS || 90_000);
const STREAM_IDLE_TTL_HTTP_MS = Number(process.env.STREAM_IDLE_TTL_HTTP_MS || 180_000);
const STREAM_IDLE_TTL_RTSP_MS = Number(process.env.STREAM_IDLE_TTL_RTSP_MS || 180_000);
const STREAM_CLEANUP_INTERVAL_MS = Number(process.env.STREAM_CLEANUP_INTERVAL_MS || 30_000);

// ─── Health Monitor constants ────────────────────────────────────
const HEALTH_CHECK_INTERVAL_MS = 5_000;   // check every 5 seconds
const HEALTH_STALE_THRESHOLD_MS = 10_000; // unhealthy after 10 seconds without m3u8 update
const HEALTH_MAX_RESTARTS = 5;
const HEALTH_RESTART_WINDOW_MS = 2 * 60_000; // 2 minutes

function getIdleTtlMs(stream) {
  if (!stream) return STREAM_IDLE_TTL_RTSP_MS;
  if (stream.sourceType === 'tcp_live' || stream.mode === 'live' || stream._liveProxy) return STREAM_IDLE_TTL_LIVE_MS;
  if (stream.sourceType === 'http') return STREAM_IDLE_TTL_HTTP_MS;
  return STREAM_IDLE_TTL_RTSP_MS;
}

const _cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [cameraId, stream] of activeStreams) {
    if (!stream || stream.state === 'stopped') continue;
    const last = stream.lastAccessedAt || 0;
    const ttl = getIdleTtlMs(stream);
    if (last && now - last > ttl) {
      log('info', `[${cameraId}] Idle TTL exceeded (${Math.round((now - last) / 1000)}s > ${Math.round(ttl / 1000)}s), stopping stream`);
      try {
        streamManager.stop(cameraId);
      } catch (err) {
        log('warn', `[${cameraId}] Idle cleanup failed: ${err.message}`);
      }
    }
  }
}, STREAM_CLEANUP_INTERVAL_MS);
if (typeof _cleanupTimer.unref === 'function') _cleanupTimer.unref();

const COPY_FAIL_PATTERNS = [
  'non monotonically increasing dts',
  'Could not find codec',
  'codec not currently supported',
  'Invalid data found',
  'error while decoding',
  'missing picture in access unit',
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
    }
  }
}

function isHttpSource(url) {
  return url && (url.startsWith('http://') || url.startsWith('https://'));
}

function buildFfmpegArgs(inputUrl, hlsDir, cameraId, transcode = false, forceLibx264 = false) {
  const segmentPath = path.join(hlsDir, 'segment_%03d.ts');
  const playlistPath = path.join(hlsDir, 'index.m3u8');

  const args = [];

  if (isHttpSource(inputUrl)) {
    // HTTP raw stream (e.g. CloseLi cameras recording files)
    // -re reads at native framerate so a 60s segment plays for 60s (not 2s)
    args.push(
      '-re',
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      // [LOW-LATENCY TUNING] Reduced probe/analyze for faster startup (was 5000000/5000000)
      '-probesize', '1000000',
      '-analyzeduration', '1000000',
      '-f', 'h264',
      '-i', inputUrl,
      '-an',
    );
    if (transcode) {
      const enc = getHttpTranscodeArgs(forceLibx264);
      log('info', `[${cameraId}] STREAM ENCODER = ${enc.encoder === 'nvenc' ? 'NVENC' : 'CPU'} (HTTP transcode)`);
      args.push(...enc.args);
    } else {
      // Try codec copy first (preserves full 1600x960 quality)
      args.push(
        '-c:v', 'copy',
        '-bsf:v', 'dump_extra',
      );
    }
  } else {
    // RTSP stream
    args.push(
      '-rtsp_transport', 'tcp',
      '-i', inputUrl,
      '-an',
    );

    if (transcode) {
      const enc = getRtspTranscodeArgs(forceLibx264);
      log('info', `[${cameraId}] STREAM ENCODER = ${enc.encoder === 'nvenc' ? 'NVENC' : 'CPU'} (RTSP transcode)`);
      args.push(...enc.args);
    } else {
      args.push('-c:v', 'copy');
    }
  }

  // [LOW-LATENCY TUNING] hls_time 1s, hls_list_size 3, omit_endlist keeps playlist live
  args.push(
    '-f', 'hls',
    '-hls_time', '1',
    '-hls_list_size', '3',
    '-hls_flags', 'delete_segments+append_list+omit_endlist+program_date_time',
    '-hls_segment_filename', segmentPath,
    playlistPath,
  );

  // ─── WebRTC: push copy to MediaMTX via RTSP ──────────────────
  if (mediaMtxAvailable) {
    args.push(
      '-c:v', 'copy',
      '-an',
      '-f', 'rtsp',
      '-rtsp_transport', 'tcp',
      `${MEDIAMTX_RTSP_URL}/${cameraId}`,
    );
    log('info', `[${cameraId}] WebRTC: pushing to ${MEDIAMTX_RTSP_URL}/${cameraId}`);
  }

  // ─── Continuous recording to local disk ────────────────────────
  if (AUTO_RECORD_ENABLED) {
    const recDir = path.join(RECORDINGS_ROOT, cameraId);
    ensureDir(recDir);
    const recPattern = path.join(recDir, `${cameraId}_%Y-%m-%d_%H-%M-%S.mp4`);
    args.push(
      '-c:v', 'copy',
      '-an',
      '-f', 'segment',
      '-segment_time', String(AUTO_RECORD_SEGMENT_SEC),
      '-segment_format', 'mp4',
      '-reset_timestamps', '1',
      '-strftime', '1',
      '-movflags', '+frag_keyframe',
      recPattern,
    );
    log('info', `[${cameraId}] Auto-recording: ${AUTO_RECORD_SEGMENT_SEC}s segments → ${recDir}`);
  }

  return { args, playlistPath };
}

function spawnFfmpeg(cameraId, inputUrl, transcode = false, clean = true, forceLibx264 = false) {
  const hlsDir = path.join(HLS_ROOT, cameraId);
  ensureDir(hlsDir);
  if (clean) cleanDir(hlsDir);

  const sourceType = isHttpSource(inputUrl) ? 'http' : 'rtsp';
  const mode = sourceType === 'http' ? (transcode ? 'transcode' : 'copy') : (transcode ? 'transcode' : 'copy');

  const usedNvenc = transcode && isNvencAvailable() && !forceLibx264;
  const encoder = usedNvenc ? 'h264_nvenc' : (transcode ? 'libx264' : 'copy');
  const { args, playlistPath } = buildFfmpegArgs(inputUrl, hlsDir, cameraId, transcode, forceLibx264);

  // Detailed startup log
  const startTs = new Date().toISOString();
  log('info', `[${cameraId}] ── STREAM START ──────────────────`);
  log('info', `[${cameraId}]   timestamp : ${startTs}`);
  log('info', `[${cameraId}]   inputType : ${sourceType}`);
  log('info', `[${cameraId}]   encoder   : ${encoder}`);
  log('info', `[${cameraId}]   mode      : ${mode}`);
  log('info', `[${cameraId}]   ffmpeg args: ffmpeg ${args.join(' ')}`);
  log('info', `[${cameraId}] ────────────────────────────────────`);

  const proc = spawn('ffmpeg', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stream = {
    cameraId,
    inputUrl,
    process: proc,
    pid: proc.pid,
    state: 'starting',
    mode,
    sourceType,
    encoder,
    ffmpegArgs: args,
    startedAt: startTs,
    lastAccessedAt: Date.now(),
    hlsUrl: `/hls/${cameraId}/index.m3u8`,
    playlistPath,
    hlsDir,
    stderrBuffer: '',
    error: null,
    usedNvenc,
    // Health monitor fields
    restartCount: 0,
    restartTimestamps: [],
    lastRestartAt: null,
    lastHealthyAt: null,
    healthStatus: 'starting',
  };

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stream.stderrBuffer += text;
    // Keep only last 4KB
    if (stream.stderrBuffer.length > 4096) {
      stream.stderrBuffer = stream.stderrBuffer.slice(-4096);
    }
  });

  // Register with StreamGuard for monitoring
  registerProcess(cameraId, {
    pid: proc.pid,
    encoder: usedNvenc ? 'nvenc' : (transcode ? 'cpu' : 'copy'),
    startTime: stream.startedAt,
    bitrate: 'detecting',
    fps: 'detecting',
    playlistPath,
    hlsDir: stream.hlsDir,
    inputUrl,
    transcode,
    forceLibx264,
  });

  // Watch for playlist file to confirm stream is running
  const checkInterval = setInterval(() => {
    if (fs.existsSync(playlistPath)) {
      if (stream.state === 'starting') {
        stream.state = 'running';
        resetRestartCount(cameraId);
        log('info', `[${cameraId}] Stream is running (${mode})`);
      }
      clearInterval(checkInterval);
    }
  }, 500);

  proc.on('error', (err) => {
    clearInterval(checkInterval);
    stream.state = 'error';
    stream.error = err.message;
    log('error', `[${cameraId}] FFmpeg spawn error: ${err.message}`);
  });

  proc.on('exit', (code, signal) => {
    clearInterval(checkInterval);

    if (stream.state === 'stopped') {
      log('info', `[${cameraId}] FFmpeg stopped by user`);
      return;
    }

    log('warn', `[${cameraId}] FFmpeg exited: code=${code} signal=${signal}`);

    // CloseLi auto-restart: when FFmpeg finishes a recording segment (code=0),
    // find the next file and restart for continuous playback
    if (code === 0 && closeLiMeta.has(cameraId)) {
      const meta = closeLiMeta.get(cameraId);
      log('info', `[${cameraId}] CloseLi segment finished, finding next recording...`);
      activeStreams.delete(cameraId);
      (async () => {
        try {
          const { getCloseLiStreamUrl } = await import('./closeli/telnetHelper.js');
          const result = await getCloseLiStreamUrl(meta.ip, meta.port, meta.channel, meta.lastFile || null);
          if (result && !stream._stopRequested) {
            meta.lastFile = result.fname;
            log('info', `[${cameraId}] CloseLi next file: ${result.fname}`);
            const next = spawnFfmpeg(cameraId, result.url, false, false);
            activeStreams.set(cameraId, next);
          } else {
            log('info', `[${cameraId}] CloseLi: waiting for new recording segment...`);
            const poll = async (attempts) => {
              if (stream._stopRequested || attempts <= 0) return;
              try {
                const r = await getCloseLiStreamUrl(meta.ip, meta.port, meta.channel, meta.lastFile || null);
                if (r) {
                  meta.lastFile = r.fname;
                  log('info', `[${cameraId}] CloseLi new segment: ${r.fname}`);
                  const s = spawnFfmpeg(cameraId, r.url, false, false);
                  activeStreams.set(cameraId, s);
                } else {
                  setTimeout(() => poll(attempts - 1), 5000);
                }
              } catch { setTimeout(() => poll(attempts - 1), 5000); }
            };
            setTimeout(() => poll(24), 5000); // retry up to 2 min
          }
        } catch (err) {
          log('error', `[${cameraId}] CloseLi auto-restart failed: ${err.message}`);
        }
      })();
      return;
    }

    // If copy mode failed, retry with transcode
    if (!transcode && code !== 0) {
      const isHttp = isHttpSource(inputUrl);
      const shouldRetry = isHttp || COPY_FAIL_PATTERNS.some((p) =>
        stream.stderrBuffer.toLowerCase().includes(p.toLowerCase())
      );
      if (shouldRetry) {
        log('info', `[${cameraId}] Copy mode failed (${isHttp ? 'HTTP' : 'RTSP'}), retrying with transcode...`);
        activeStreams.delete(cameraId);
        const retryStream = spawnFfmpeg(cameraId, inputUrl, true);
        activeStreams.set(cameraId, retryStream);
        return;
      }
    }

    // NVENC fallback: if transcode with NVENC failed, retry with CPU (libx264)
    if (transcode && stream.usedNvenc && code !== 0) {
      const reason = stream.stderrBuffer.slice(-500).trim();
      log('warn', `[${cameraId}] NVENC encoding failed (code=${code}), falling back to CPU (libx264)`);
      log('warn', `[${cameraId}] NVENC failure reason: ${reason}`);
      activeStreams.delete(cameraId);
      const cpuStream = spawnFfmpeg(cameraId, inputUrl, true, true, true);
      activeStreams.set(cameraId, cpuStream);
      return;
    }

    stream.state = 'error';
    stream.error = `FFmpeg exited with code ${code}`;
  });

  return stream;
}

export const streamManager = {
  getHlsRoot() {
    return HLS_ROOT;
  },

  getActiveStreams() {
    return activeStreams;
  },

  touch(cameraId) {
    const s = activeStreams.get(cameraId);
    if (s) s.lastAccessedAt = Date.now();
  },

  setCloseLiMeta(cameraId, meta) {
    closeLiMeta.set(cameraId, meta);
  },

  start(cameraId, inputUrl) {
    if (activeStreams.has(cameraId)) {
      const existing = activeStreams.get(cameraId);
      if (existing.state === 'running' || existing.state === 'starting' || existing.state === 'streaming' || existing.state === 'buffering') {
        return { success: true, stream: toPublic(existing), message: 'Stream already running' };
      }
      // Clean up dead stream
      this.stop(cameraId);
    }

    // Stream limit check
    const limitCheck = canStartStream();
    if (!limitCheck.allowed) {
      log('warn', `[${cameraId}] ${limitCheck.reason}`);
      return { success: false, message: limitCheck.reason };
    }

    const stream = spawnFfmpeg(cameraId, inputUrl, false);
    activeStreams.set(cameraId, stream);

    return { success: true, stream: toPublic(stream) };
  },

  /**
   * Start a live stream from a CloseLi camera's raw TCP port (12345).
   * This connects directly to the camera's H264 stream for real-time viewing.
   */
  startLive(cameraId, cameraIp, streamPort = 12345, channel = 0) {
    if (activeStreams.has(cameraId)) {
      const existing = activeStreams.get(cameraId);
      const liveState = existing._liveProxy ? existing._liveProxy.status : existing.state;
      if (liveState === 'running' || liveState === 'starting' || liveState === 'streaming' || liveState === 'buffering') {
        return { success: true, stream: toPublic(existing), message: 'Stream already running' };
      }
      this.stop(cameraId);
    }

    // Stream limit check
    const limitCheck = canStartStream();
    if (!limitCheck.allowed) {
      log('warn', `[${cameraId}] ${limitCheck.reason}`);
      return { success: false, message: limitCheck.reason };
    }

    const hlsDir = path.join(HLS_ROOT, cameraId);
    ensureDir(hlsDir);
    cleanDir(hlsDir);

    const proxy = startLiveStream({
      cameraIp,
      streamPort,
      channel,
      hlsOutputDir: hlsDir,
      streamId: 'index',
      cameraId,
      fps: 25,
    });

    const stream = {
      cameraId,
      inputUrl: `tcp://${cameraIp}:${streamPort}`,
      process: null,
      pid: null,
      state: 'starting',
      mode: 'live',
      sourceType: 'tcp_live',
      startedAt: new Date().toISOString(),
      lastAccessedAt: Date.now(),
      hlsUrl: `/hls/${cameraId}/index.m3u8`,
      playlistPath: path.join(hlsDir, 'index.m3u8'),
      hlsDir,
      stderrBuffer: '',
      error: null,
      _liveProxy: proxy,
      // Health monitor fields
      restartCount: 0,
      restartTimestamps: [],
      lastRestartAt: null,
      lastHealthyAt: null,
      healthStatus: 'starting',
    };

    // Poll proxy status to update stream state
    const statusInterval = setInterval(() => {
      if (!activeStreams.has(cameraId)) { clearInterval(statusInterval); return; }
      const ps = proxy.status;
      if (ps === 'streaming') {
        stream.state = 'running';
        // Check if playlist file exists
        if (!fs.existsSync(stream.playlistPath)) {
          stream.state = 'starting';
        }
      } else if (ps === 'buffering' || ps === 'connecting') {
        stream.state = 'starting';
      } else if (ps === 'error') {
        stream.state = 'error';
        stream.error = proxy.error;
        clearInterval(statusInterval);
      } else if (ps === 'stopped') {
        clearInterval(statusInterval);
      }
    }, 500);

    // Register with StreamGuard for monitoring
    registerProcess(cameraId, {
      pid: null, // live proxy manages its own FFmpeg
      encoder: 'live',
      startTime: stream.startedAt,
      bitrate: 'detecting',
      fps: 'detecting',
      playlistPath: stream.playlistPath,
      hlsDir: stream.hlsDir,
      inputUrl: stream.inputUrl,
      transcode: true,
      forceLibx264: false,
    });

    activeStreams.set(cameraId, stream);
    log('info', `[${cameraId}] Live stream started from ${cameraIp}:${streamPort}`);

    return { success: true, stream: toPublic(stream) };
  },

  stop(cameraId) {
    const stream = activeStreams.get(cameraId);
    if (!stream) {
      return { success: false, message: 'No active stream for this camera' };
    }

    stream.state = 'stopped';
    stream._stopRequested = true;
    closeLiMeta.delete(cameraId);

    // Unregister from StreamGuard
    unregisterProcess(cameraId);

    // Stop live proxy if present
    if (stream._liveProxy) {
      stream._liveProxy.stop();
      stream._liveProxy = null;
    }

    if (stream.process && !stream.process.killed) {
      try {
        stream.process.kill('SIGTERM');
        setTimeout(() => {
          if (stream.process && !stream.process.killed) {
            stream.process.kill('SIGKILL');
          }
        }, 3000);
      } catch { /* ignore */ }
    }

    // Clean up HLS files
    setTimeout(() => cleanDir(stream.hlsDir), 1000);

    activeStreams.delete(cameraId);
    log('info', `[${cameraId}] Stream stopped and cleaned`);

    return { success: true };
  },

  status() {
    const result = {};
    for (const [id, stream] of activeStreams) {
      result[id] = toPublic(stream);
    }
    return result;
  },

  getStream(cameraId) {
    const stream = activeStreams.get(cameraId);
    return stream ? toPublic(stream) : null;
  },

  getRawStream(cameraId) {
    return activeStreams.get(cameraId) || null;
  },

  stopAll() {
    for (const [id] of activeStreams) {
      this.stop(id);
    }
    for (const [id] of activeRecordings) {
      this.stopRecording(id);
    }
  },

  getDiagnostics() {
    const result = [];
    for (const [id, stream] of activeStreams) {
      result.push({
        cameraId: id,
        status: stream.state,
        encoder: stream.encoder || (stream._liveProxy ? 'live_transcode' : 'unknown'),
        pid: stream.pid || (stream._liveProxy ? 'managed' : null),
        startedAt: stream.startedAt,
        inputType: stream.sourceType,
        outputPath: stream.playlistPath,
        lastError: stream.error,
        ffmpegArgs: stream.ffmpegArgs ? stream.ffmpegArgs.join(' ') : (stream._liveProxy ? 'managed by liveStreamProxy' : null),
        restartCount: stream.restartCount || 0,
        lastRestartAt: stream.lastRestartAt || null,
        lastHealthyAt: stream.lastHealthyAt || null,
        healthStatus: stream.healthStatus || 'unknown',
      });
    }
    return result;
  },

  // ─── Recording to local disk ──────────────────────────────────

  startRecording(cameraId, inputUrl, cameraName = '') {
    if (activeRecordings.has(cameraId)) {
      const rec = activeRecordings.get(cameraId);
      return { success: true, recording: toRecPublic(rec), message: 'Already recording' };
    }

    ensureDir(RECORDINGS_ROOT);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeName = (cameraName || cameraId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safeName}_${ts}.mp4`;
    const filePath = path.join(RECORDINGS_ROOT, fileName);

    const args = [];
    if (inputUrl.startsWith('http')) {
      args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
    } else {
      args.push('-rtsp_transport', 'tcp');
    }
    const recEnc = getRecordingArgs(this._recForceCpu);
    log('info', `[${cameraId}] STREAM ENCODER = ${recEnc.encoder === 'nvenc' ? 'NVENC' : 'CPU'} (recording)`);
    args.push(
      '-i', inputUrl,
      ...recEnc.args,
      '-an',
      '-f', 'mp4', '-movflags', '+frag_keyframe+empty_moov',
      filePath,
    );

    log('info', `[${cameraId}] Starting recording → ${fileName}`);
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    const rec = {
      cameraId,
      process: proc,
      filePath,
      fileName,
      startedAt: new Date().toISOString(),
      state: 'recording',
      error: null,
      usedNvenc: recEnc.encoder === 'nvenc',
    };

    proc.on('error', (err) => {
      rec.state = 'error';
      rec.error = err.message;
      log('error', `[${cameraId}] Recording error: ${err.message}`);
    });

    proc.on('exit', (code) => {
      if (rec.state !== 'stopped') {
        // NVENC fallback: if recording with NVENC failed, retry with CPU
        if (rec.usedNvenc && code !== 0) {
          log('warn', `[${cameraId}] NVENC recording failed, falling back to CPU (libx264)...`);
          activeRecordings.delete(cameraId);
          this._recForceCpu = true;
          this.startRecording(cameraId, inputUrl, cameraName);
          return;
        }
        // If CloseLi segment ended, auto-restart recording with next segment
        if (code === 0 && closeLiMeta.has(cameraId)) {
          log('info', `[${cameraId}] Recording segment finished, finding next...`);
          activeRecordings.delete(cameraId);
          (async () => {
            try {
              const { getCloseLiStreamUrl } = await import('./closeli/telnetHelper.js');
              const meta = closeLiMeta.get(cameraId);
              const r = await getCloseLiStreamUrl(meta.ip, meta.port, meta.channel, meta.lastFile || null);
              if (r) {
                meta.lastFile = r.fname;
                this.startRecording(cameraId, r.url, cameraName);
              }
            } catch { /* */ }
          })();
          return;
        }
        rec.state = 'error';
        rec.error = `FFmpeg exited with code ${code}`;
      }
    });

    activeRecordings.set(cameraId, rec);
    return { success: true, recording: toRecPublic(rec) };
  },

  stopRecording(cameraId) {
    const rec = activeRecordings.get(cameraId);
    if (!rec) {
      return { success: false, message: 'No active recording' };
    }
    rec.state = 'stopped';
    if (rec.process && !rec.process.killed) {
      try { rec.process.kill('SIGTERM'); } catch { /* */ }
    }
    activeRecordings.delete(cameraId);
    log('info', `[${cameraId}] Recording stopped → ${rec.fileName}`);
    return { success: true, fileName: rec.fileName };
  },

  getRecordingStatus(cameraId) {
    const rec = activeRecordings.get(cameraId);
    return rec ? toRecPublic(rec) : null;
  },

  getAllRecordingStatus() {
    const result = {};
    for (const [id, rec] of activeRecordings) {
      result[id] = toRecPublic(rec);
    }
    return result;
  },

  getRecordingsRoot() {
    return RECORDINGS_ROOT;
  },
};

// Initialize StreamGuard with reference to streamManager
initStreamGuard(streamManager);

// ─── Health Monitor ──────────────────────────────────────────────
// Checks every 5s if each active stream's m3u8 was updated recently.
// If stale >10s → unhealthy → auto-restart (up to 5 times in 2 min).

const _healthTimer = setInterval(() => {
  const now = Date.now();
  for (const [cameraId, stream] of activeStreams) {
    // Skip streams that are not supposed to be running
    if (!stream || stream.state === 'stopped' || stream.healthStatus === 'failed') continue;

    // Skip live proxy streams — they manage their own FFmpeg lifecycle
    if (stream._liveProxy) continue;

    // Skip streams still starting up (give them 15s grace)
    const startAge = now - new Date(stream.startedAt).getTime();
    if (stream.state === 'starting' && startAge < 15_000) continue;

    const playlistPath = stream.playlistPath;
    if (!playlistPath) continue;

    try {
      if (fs.existsSync(playlistPath)) {
        const stat = fs.statSync(playlistPath);
        const mtime = stat.mtimeMs;
        const staleness = now - mtime;

        if (staleness <= HEALTH_STALE_THRESHOLD_MS) {
          // Healthy
          if (stream.healthStatus !== 'healthy') {
            stream.healthStatus = 'healthy';
          }
          stream.lastHealthyAt = new Date().toISOString();
          continue;
        }

        // Stale — unhealthy
        if (stream.healthStatus === 'healthy' || stream.healthStatus === 'starting') {
          log('warn', `[${cameraId}] Stream unhealthy – m3u8 stale for ${Math.round(staleness / 1000)}s, restarting`);
        }
        stream.healthStatus = 'unhealthy';
      } else {
        // No playlist file yet — if stream has been up >15s, it's unhealthy
        if (startAge > 15_000) {
          if (stream.healthStatus !== 'unhealthy') {
            log('warn', `[${cameraId}] Stream unhealthy – no m3u8 file after ${Math.round(startAge / 1000)}s`);
          }
          stream.healthStatus = 'unhealthy';
        } else {
          continue;
        }
      }
    } catch {
      stream.healthStatus = 'unhealthy';
    }

    // ── Auto-restart logic ──
    if (stream.healthStatus !== 'unhealthy') continue;

    // Prune restart timestamps outside the window
    stream.restartTimestamps = (stream.restartTimestamps || []).filter(
      (ts) => now - ts < HEALTH_RESTART_WINDOW_MS
    );

    if (stream.restartTimestamps.length >= HEALTH_MAX_RESTARTS) {
      // Exceeded max restarts in window
      if (stream.healthStatus !== 'failed') {
        stream.healthStatus = 'failed';
        stream.state = 'error';
        stream.error = `Stream marked as failed after ${HEALTH_MAX_RESTARTS} restarts in ${HEALTH_RESTART_WINDOW_MS / 1000}s`;
        log('error', `[${cameraId}] Stream marked as failed after ${HEALTH_MAX_RESTARTS} restarts in ${HEALTH_RESTART_WINDOW_MS / 1000}s`);
      }
      continue;
    }

    // Perform restart
    stream.healthStatus = 'restarting';
    stream.restartCount = (stream.restartCount || 0) + 1;
    stream.restartTimestamps.push(now);
    stream.lastRestartAt = new Date().toISOString();

    log('info', `[${cameraId}] Stream restart executed (attempt ${stream.restartCount}, ${stream.restartTimestamps.length}/${HEALTH_MAX_RESTARTS} in window)`);

    // Kill existing FFmpeg process
    if (stream.process && !stream.process.killed) {
      try { stream.process.kill('SIGTERM'); } catch { /* ignore */ }
    }
    if (stream._liveProxy) {
      try { stream._liveProxy.stop(); } catch { /* ignore */ }
    }

    // Restart after a short delay to let the old process die
    const restartCameraId = cameraId;
    const restartInputUrl = stream.inputUrl;
    const restartSourceType = stream.sourceType;
    const savedRestartCount = stream.restartCount;
    const savedRestartTimestamps = [...stream.restartTimestamps];
    const savedLastRestartAt = stream.lastRestartAt;
    const savedLastHealthyAt = stream.lastHealthyAt;

    setTimeout(() => {
      // Remove old stream
      activeStreams.delete(restartCameraId);
      unregisterProcess(restartCameraId);

      let newStream;
      if (restartSourceType === 'tcp_live') {
        // Re-use startLive for live proxy streams
        // Extract ip/port from tcp://ip:port
        const match = restartInputUrl.match(/tcp:\/\/([^:]+):(\d+)/);
        if (match) {
          const result = streamManager.startLive(restartCameraId, match[1], Number(match[2]), stream.liveChannel || 0);
          newStream = activeStreams.get(restartCameraId);
        }
      } else {
        newStream = spawnFfmpeg(restartCameraId, restartInputUrl, false);
        activeStreams.set(restartCameraId, newStream);
      }

      // Carry over health state to new stream
      if (newStream) {
        newStream.restartCount = savedRestartCount;
        newStream.restartTimestamps = savedRestartTimestamps;
        newStream.lastRestartAt = savedLastRestartAt;
        newStream.lastHealthyAt = savedLastHealthyAt;
        newStream.healthStatus = 'starting';
      }
    }, 1000);
  }
}, HEALTH_CHECK_INTERVAL_MS);
if (typeof _healthTimer.unref === 'function') _healthTimer.unref();

function toPublic(stream) {
  return {
    cameraId: stream.cameraId,
    state: stream.state,
    mode: stream.mode,
    encoder: stream.encoder || 'unknown',
    startedAt: stream.startedAt,
    hlsUrl: stream.hlsUrl,
    error: stream.error,
  };
}

function toRecPublic(rec) {
  return {
    cameraId: rec.cameraId,
    state: rec.state,
    fileName: rec.fileName,
    startedAt: rec.startedAt,
    error: rec.error,
  };
}

// ─── Auto-Recording Retention Cleanup ──────────────────────────
// Runs every hour, deletes recording files older than AUTO_RECORD_RETENTION_DAYS.
if (AUTO_RECORD_ENABLED && AUTO_RECORD_RETENTION_DAYS > 0) {
  const _retentionTimer = setInterval(() => {
    const maxAgeMs = AUTO_RECORD_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let deleted = 0;

    try {
      if (!fs.existsSync(RECORDINGS_ROOT)) return;
      const cameraDirs = fs.readdirSync(RECORDINGS_ROOT);

      for (const dir of cameraDirs) {
        const dirPath = path.join(RECORDINGS_ROOT, dir);
        try {
          const stat = fs.statSync(dirPath);
          if (!stat.isDirectory()) continue;
        } catch { continue; }

        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.mp4'));
        for (const file of files) {
          try {
            const filePath = path.join(dirPath, file);
            const fileStat = fs.statSync(filePath);
            if (now - fileStat.mtimeMs > maxAgeMs) {
              fs.unlinkSync(filePath);
              deleted++;
            }
          } catch { /* ignore individual file errors */ }
        }
      }

      if (deleted > 0) {
        log('info', `[AutoRecord] Retention cleanup: deleted ${deleted} files older than ${AUTO_RECORD_RETENTION_DAYS} days`);
      }
    } catch (err) {
      log('warn', `[AutoRecord] Retention cleanup error: ${err.message}`);
    }
  }, 60 * 60 * 1000); // every hour
  if (typeof _retentionTimer.unref === 'function') _retentionTimer.unref();

  log('info', `[AutoRecord] Continuous recording ENABLED — ${AUTO_RECORD_SEGMENT_SEC}s segments, ${AUTO_RECORD_RETENTION_DAYS} day retention → ${RECORDINGS_ROOT}`);
}
