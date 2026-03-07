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
import fs from 'fs';
import path from 'path';
import { sanitizeUrl, log } from './sanitize.js';
import { startLiveStream } from './streaming/liveStreamProxy.js';

const HLS_ROOT = path.resolve('hls');
const RECORDINGS_ROOT = path.resolve('recordings');
const activeStreams = new Map();
const activeRecordings = new Map(); // cameraId → { process, filePath, startedAt }
const closeLiMeta = new Map(); // cameraId → { ip, port, channel, lastFile } for auto-restart

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

function buildFfmpegArgs(inputUrl, hlsDir, cameraId, transcode = false) {
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
      '-probesize', '5000000',
      '-analyzeduration', '5000000',
      '-f', 'h264',
      '-i', inputUrl,
      '-an',
    );
    if (transcode) {
      args.push(
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-profile:v', 'baseline',
        '-b:v', '4000k',
        '-maxrate', '4000k',
        '-bufsize', '8000k',
        '-g', '16',
        '-keyint_min', '16',
        '-force_key_frames', 'expr:gte(t,n_forced*2)',
      );
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
      args.push(
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-profile:v', 'baseline',
        '-b:v', '1500k',
        '-maxrate', '1500k',
        '-bufsize', '3000k',
      );
    } else {
      args.push('-c:v', 'copy');
    }
  }

  args.push(
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '10',
    '-hls_flags', 'delete_segments+append_list',
    '-hls_segment_filename', segmentPath,
    playlistPath,
  );

  return { args, playlistPath };
}

function spawnFfmpeg(cameraId, inputUrl, transcode = false, clean = true) {
  const hlsDir = path.join(HLS_ROOT, cameraId);
  ensureDir(hlsDir);
  if (clean) cleanDir(hlsDir);

  const sourceType = isHttpSource(inputUrl) ? 'http' : 'rtsp';
  const mode = sourceType === 'http' ? 'transcode' : (transcode ? 'transcode' : 'copy');
  log('info', `[${cameraId}] Starting FFmpeg (${mode}, ${sourceType}) for ${sanitizeUrl(inputUrl)}`);

  const { args, playlistPath } = buildFfmpegArgs(inputUrl, hlsDir, cameraId, transcode);

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
    startedAt: new Date().toISOString(),
    hlsUrl: `/hls/${cameraId}/index.m3u8`,
    playlistPath,
    hlsDir,
    stderrBuffer: '',
    error: null,
  };

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stream.stderrBuffer += text;
    // Keep only last 4KB
    if (stream.stderrBuffer.length > 4096) {
      stream.stderrBuffer = stream.stderrBuffer.slice(-4096);
    }
  });

  // Watch for playlist file to confirm stream is running
  const checkInterval = setInterval(() => {
    if (fs.existsSync(playlistPath)) {
      if (stream.state === 'starting') {
        stream.state = 'running';
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
            const next = spawnFfmpeg(cameraId, result.url, true, false);
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
                  const s = spawnFfmpeg(cameraId, r.url, true, false);
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

    stream.state = 'error';
    stream.error = `FFmpeg exited with code ${code}`;
  });

  return stream;
}

export const streamManager = {
  getHlsRoot() {
    return HLS_ROOT;
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

    const hlsDir = path.join(HLS_ROOT, cameraId);
    ensureDir(hlsDir);
    cleanDir(hlsDir);

    const proxy = startLiveStream({
      cameraIp,
      streamPort,
      channel,
      hlsOutputDir: hlsDir,
      streamId: 'index',
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
      hlsUrl: `/hls/${cameraId}/index.m3u8`,
      playlistPath: path.join(hlsDir, 'index.m3u8'),
      hlsDir,
      stderrBuffer: '',
      error: null,
      _liveProxy: proxy,
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

  stopAll() {
    for (const [id] of activeStreams) {
      this.stop(id);
    }
    for (const [id] of activeRecordings) {
      this.stopRecording(id);
    }
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
    args.push(
      '-i', inputUrl,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
      '-profile:v', 'baseline', '-b:v', '1500k',
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
    };

    proc.on('error', (err) => {
      rec.state = 'error';
      rec.error = err.message;
      log('error', `[${cameraId}] Recording error: ${err.message}`);
    });

    proc.on('exit', (code) => {
      if (rec.state !== 'stopped') {
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

function toPublic(stream) {
  return {
    cameraId: stream.cameraId,
    state: stream.state,
    mode: stream.mode,
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
