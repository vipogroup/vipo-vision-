/**
 * VIPO Vision — Stream Guard
 *
 * Professional stream control and protection layer.
 * Provides:
 *   - Global concurrent stream limit
 *   - FFmpeg process monitoring (pid, encoder, startTime, bitrate, fps)
 *   - Watchdog: checks FFmpeg alive, HLS playlist freshness, auto-restart stale streams
 *   - Automatic restart with exponential backoff (max 5 retries)
 *   - System streams API data
 */

import fs from 'fs';
import { log } from './sanitize.js';

// ─── Configuration ────────────────────────────────────────────────
const MAX_CONCURRENT_STREAMS = Number(process.env.MAX_CONCURRENT_STREAMS || 24);
const WATCHDOG_INTERVAL_MS = Number(process.env.WATCHDOG_INTERVAL_MS || 10_000);
const STALE_PLAYLIST_THRESHOLD_MS = Number(process.env.STALE_PLAYLIST_THRESHOLD_MS || 15_000);
const MAX_RESTART_ATTEMPTS = Number(process.env.MAX_RESTART_ATTEMPTS || 5);

// ─── In-memory process registry ───────────────────────────────────
// cameraId → { pid, encoder, startTime, bitrate, fps, playlistPath, hlsDir, lastPlaylistMtime, restartCount, lastRestartAt }
const processRegistry = new Map();

// Server start time for uptime calculation
const serverStartTime = Date.now();

// Reference to streamManager (set via init)
let _streamManager = null;

/**
 * Initialize streamGuard with a reference to the streamManager.
 * Must be called after streamManager is imported.
 */
export function initStreamGuard(streamManager) {
  _streamManager = streamManager;
  log('info', `[StreamGuard] Initialized — max concurrent streams: ${MAX_CONCURRENT_STREAMS}, watchdog interval: ${WATCHDOG_INTERVAL_MS / 1000}s`);
}

// ─── Stream Limit ─────────────────────────────────────────────────

/**
 * Check if a new stream can be started.
 * @returns {{ allowed: boolean, reason?: string, current: number, max: number }}
 */
export function canStartStream() {
  const current = processRegistry.size;
  if (current >= MAX_CONCURRENT_STREAMS) {
    return {
      allowed: false,
      reason: `Stream limit reached (${current}/${MAX_CONCURRENT_STREAMS})`,
      current,
      max: MAX_CONCURRENT_STREAMS,
    };
  }
  return { allowed: true, current, max: MAX_CONCURRENT_STREAMS };
}

/**
 * @returns {number} The configured max concurrent streams.
 */
export function getMaxStreams() {
  return MAX_CONCURRENT_STREAMS;
}

// ─── Process Registration ─────────────────────────────────────────

/**
 * Register an FFmpeg process for monitoring.
 * @param {string} cameraId
 * @param {object} info - { pid, encoder, startTime, bitrate, fps, playlistPath, hlsDir, inputUrl, transcode, forceLibx264 }
 */
export function registerProcess(cameraId, info) {
  const existing = processRegistry.get(cameraId);
  const restartCount = existing ? existing.restartCount : 0;

  processRegistry.set(cameraId, {
    cameraId,
    pid: info.pid || null,
    encoder: info.encoder || 'unknown',
    startTime: info.startTime || new Date().toISOString(),
    bitrate: info.bitrate || 'unknown',
    fps: info.fps || 'unknown',
    playlistPath: info.playlistPath || null,
    hlsDir: info.hlsDir || null,
    inputUrl: info.inputUrl || null,
    transcode: info.transcode || false,
    forceLibx264: info.forceLibx264 || false,
    lastPlaylistMtime: Date.now(),
    restartCount,
    lastRestartAt: null,
    state: 'active',
  });

  const encoderLabel = info.encoder === 'nvenc' ? 'NVENC' : 'CPU';
  log('info', `[StreamGuard] STREAM START ${cameraId} | pid=${info.pid} | ENCODER TYPE ${encoderLabel}`);
}

/**
 * Unregister an FFmpeg process (on intentional stop).
 * @param {string} cameraId
 */
export function unregisterProcess(cameraId) {
  if (processRegistry.has(cameraId)) {
    processRegistry.delete(cameraId);
    log('info', `[StreamGuard] STREAM STOP ${cameraId}`);
  }
}

/**
 * Update process info (e.g. after restart with different encoder).
 */
export function updateProcess(cameraId, updates) {
  const entry = processRegistry.get(cameraId);
  if (entry) {
    Object.assign(entry, updates);
  }
}

// ─── Restart Logic (exponential backoff) ──────────────────────────

/**
 * Attempt to restart a stream with exponential backoff.
 * @param {string} cameraId
 * @returns {boolean} Whether restart was initiated
 */
function attemptRestart(cameraId) {
  if (!_streamManager) {
    log('error', `[StreamGuard] Cannot restart ${cameraId} — streamManager not initialized`);
    return false;
  }

  const entry = processRegistry.get(cameraId);
  if (!entry) return false;

  if (entry.restartCount >= MAX_RESTART_ATTEMPTS) {
    log('error', `[StreamGuard] STREAM RESTART FAILED ${cameraId} — max retries (${MAX_RESTART_ATTEMPTS}) exceeded`);
    entry.state = 'dead';
    return false;
  }

  // Exponential backoff: 2^restartCount * 1000ms (1s, 2s, 4s, 8s, 16s)
  const delayMs = Math.pow(2, entry.restartCount) * 1000;
  entry.restartCount++;
  entry.lastRestartAt = new Date().toISOString();
  entry.state = 'restarting';

  log('warn', `[StreamGuard] STREAM RESTART ${cameraId} | attempt ${entry.restartCount}/${MAX_RESTART_ATTEMPTS} | backoff ${delayMs}ms`);

  setTimeout(() => {
    try {
      // Check if stream was manually stopped during backoff
      const current = processRegistry.get(cameraId);
      if (!current || current.state === 'stopped') return;

      // Stop existing stream first
      _streamManager.stop(cameraId);

      // Re-start the stream
      if (entry.inputUrl) {
        const result = _streamManager.start(cameraId, entry.inputUrl);
        if (result.success) {
          log('info', `[StreamGuard] STREAM RESTART SUCCESS ${cameraId} | attempt ${entry.restartCount}`);
        } else {
          log('error', `[StreamGuard] STREAM RESTART FAILED ${cameraId} | ${result.message}`);
        }
      }
    } catch (err) {
      log('error', `[StreamGuard] Restart error for ${cameraId}: ${err.message}`);
    }
  }, delayMs);

  return true;
}

/**
 * Reset restart counter for a stream (called on successful stream start).
 */
export function resetRestartCount(cameraId) {
  const entry = processRegistry.get(cameraId);
  if (entry) {
    entry.restartCount = 0;
    entry.state = 'active';
  }
}

// ─── Watchdog ─────────────────────────────────────────────────────

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0); // signal 0 = check existence only
    return true;
  } catch {
    return false;
  }
}

function checkPlaylistFreshness(playlistPath) {
  try {
    if (!playlistPath || !fs.existsSync(playlistPath)) return { exists: false, mtime: 0 };
    const stat = fs.statSync(playlistPath);
    return { exists: true, mtime: stat.mtimeMs };
  } catch {
    return { exists: false, mtime: 0 };
  }
}

function watchdogTick() {
  if (!_streamManager) return;
  const now = Date.now();

  for (const [cameraId, entry] of processRegistry) {
    if (entry.state === 'restarting' || entry.state === 'dead' || entry.state === 'stopped') continue;

    // Skip live proxy streams — they manage their own FFmpeg lifecycle
    if (entry.encoder === 'live' && !entry.pid) continue;

    // Check 1: Is the FFmpeg process still alive?
    if (entry.pid && !isProcessAlive(entry.pid)) {
      log('warn', `[StreamGuard] Watchdog: FFmpeg process ${entry.pid} for ${cameraId} is dead`);
      attemptRestart(cameraId);
      continue;
    }

    // Check 2: Is the HLS playlist being updated?
    if (entry.playlistPath) {
      const playlist = checkPlaylistFreshness(entry.playlistPath);
      if (playlist.exists) {
        // Update last known mtime
        if (playlist.mtime > entry.lastPlaylistMtime) {
          entry.lastPlaylistMtime = playlist.mtime;
        }

        // Check if playlist is stale (no new segments for threshold)
        const staleDuration = now - entry.lastPlaylistMtime;
        if (staleDuration > STALE_PLAYLIST_THRESHOLD_MS) {
          log('warn', `[StreamGuard] Watchdog: Playlist stale for ${cameraId} (${Math.round(staleDuration / 1000)}s > ${STALE_PLAYLIST_THRESHOLD_MS / 1000}s)`);
          attemptRestart(cameraId);
          continue;
        }
      }
      // If playlist doesn't exist yet but stream just started (< 15s), that's normal
    }
  }
}

// Start the watchdog timer
const _watchdogTimer = setInterval(watchdogTick, WATCHDOG_INTERVAL_MS);
if (typeof _watchdogTimer.unref === 'function') _watchdogTimer.unref();

// ─── System Streams API Data ──────────────────────────────────────

/**
 * Get system streams information for the API endpoint.
 * @returns {object} System streams data
 */
export function getSystemStreamsInfo() {
  const processes = [];
  let nvencCount = 0;
  let cpuCount = 0;

  for (const [cameraId, entry] of processRegistry) {
    if (entry.encoder === 'nvenc') nvencCount++;
    else cpuCount++;

    processes.push({
      cameraId,
      pid: entry.pid,
      encoder: entry.encoder,
      startTime: entry.startTime,
      bitrate: entry.bitrate,
      fps: entry.fps,
      state: entry.state,
      restartCount: entry.restartCount,
      lastRestartAt: entry.lastRestartAt,
    });
  }

  return {
    totalStreams: processRegistry.size,
    maxStreams: MAX_CONCURRENT_STREAMS,
    nvencStreams: nvencCount,
    cpuStreams: cpuCount,
    uptime: Math.round((Date.now() - serverStartTime) / 1000),
    watchdog: {
      intervalMs: WATCHDOG_INTERVAL_MS,
      staleThresholdMs: STALE_PLAYLIST_THRESHOLD_MS,
      maxRestartAttempts: MAX_RESTART_ATTEMPTS,
    },
    ffmpegProcesses: processes,
  };
}

/**
 * Get the process registry (for internal use).
 */
export function getProcessRegistry() {
  return processRegistry;
}
