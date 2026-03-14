/**
 * CloseLi Live Stream Proxy
 *
 * Connects to the camera's raw TCP port (12345) which multiplexes all 4 channels.
 * The protocol uses 16-byte headers before each H264 access unit:
 *   [4B field0][4B: 1][4B field2/length][4B field3/channelStream]
 * where field3 encodes: channel = floor(field3/3), quality = field3%3 (0=main,1=sub,2=thumb)
 *
 * This proxy demultiplexes the stream, extracting only the desired channel's
 * main-quality NAL units, and pipes clean H264 to FFmpeg for HLS output.
 *
 * A shared TCP connection is used for all channels from the same camera IP.
 */

import net from 'net';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { log } from '../sanitize.js';
// getLiveTranscodeArgs no longer needed — live streams use copy mode

const NAL_TYPE_SPS = 7;

// ─── MediaMTX WebRTC integration ─────────────────────────────────
const MEDIAMTX_RTSP_URL = process.env.MEDIAMTX_RTSP_URL || 'rtsp://127.0.0.1:8554';
const MEDIAMTX_RTSP_PORT = Number(process.env.MEDIAMTX_RTSP_PORT || 8554);

function checkMediaMtxLive() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.connect(MEDIAMTX_RTSP_PORT, '127.0.0.1');
  });
}

// ─── Shared connection manager ────────────────────────────────────
// One TCP connection per camera IP, with multiple channel consumers.
const sharedConnections = new Map(); // cameraIp:port → { socket, consumers: Map<channelField3, Set<callback>> }

function getSharedConnection(cameraIp, streamPort) {
  const key = `${cameraIp}:${streamPort}`;
  if (sharedConnections.has(key)) {
    const conn = sharedConnections.get(key);
    conn.refCount++;
    return conn;
  }

  const conn = {
    key,
    socket: null,
    consumers: new Map(), // field3 → Set of callback(nalBuffer)
    earlyBuffers: new Map(), // field3 → Buffer[] (early data for late consumers)
    refCount: 1,
    status: 'connecting',
  };

  const socket = new net.Socket();
  conn.socket = socket;

  // Accumulation buffer for protocol parsing
  let accum = Buffer.alloc(0);
  const seenField3 = new Map(); // field3 → frameCount (diagnostic)
  let lastDiagAt = 0;

  socket.setTimeout(60000);

  socket.on('connect', () => {
    log('info', `[shared-${key}] Connected to multiplexed stream`);
    conn.status = 'connected';
  });

  socket.on('data', (data) => {
    // Append to accumulator
    accum = Buffer.concat([accum, data]);

    // Protocol frame format:
    // [4B field0][01 00 00 00][4B field2][4B field3][00 00 00 01 ...H264 data...]
    // We find frame boundaries by looking for positions where:
    //   bytes[pos+4..pos+7] == 01 00 00 00  (field1)
    //   bytes[pos+16..pos+19] == 00 00 00 01 (NAL start code)
    // pos is the start of the 16-byte protocol header.

    // Find all protocol header positions
    const headers = [];
    for (let i = 0; i <= accum.length - 20; i++) {
      if (accum[i + 4] === 1 && accum[i + 5] === 0 && accum[i + 6] === 0 && accum[i + 7] === 0 &&
          accum[i + 16] === 0 && accum[i + 17] === 0 && accum[i + 18] === 0 && accum[i + 19] === 1) {
        headers.push(i);
      }
    }

    if (headers.length < 2) {
      // Need at least 2 headers to extract one complete frame
      // Prevent unbounded growth
      if (accum.length > 4 * 1024 * 1024) {
        accum = accum.slice(accum.length - 1024);
      }
      return;
    }

    // Process complete frames (between consecutive headers)
    for (let h = 0; h < headers.length - 1; h++) {
      const hdrPos = headers[h];
      const nextHdrPos = headers[h + 1];

      // Extract field3 (channel/stream ID) from bytes 12-15 of header
      const field3 = accum.readUInt32LE(hdrPos + 12);

      // H264 data is from hdrPos+16 to nextHdrPos
      const h264Data = accum.slice(hdrPos + 16, nextHdrPos);

      if (h264Data.length > 0 && field3 >= 0 && field3 < 100) {
        // Diagnostic: track all field3 values seen
        seenField3.set(field3, (seenField3.get(field3) || 0) + 1);
        const now = Date.now();
        if (now - lastDiagAt > 10000) {
          lastDiagAt = now;
          const summary = [...seenField3.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([f3, cnt]) => `f3=${f3}(ch${Math.floor(f3/3)}q${f3%3}):${cnt}`)
            .join(', ');
          log('info', `[shared-${key}] field3 seen: ${summary}`);
        }

        // Buffer early data for channels that don't have consumers yet
        // so late-registering consumers can replay SPS/PPS
        if (!conn.consumers.has(field3) || conn.consumers.get(field3).size === 0) {
          if (!conn.earlyBuffers.has(field3)) conn.earlyBuffers.set(field3, []);
          const buf = conn.earlyBuffers.get(field3);
          const totalSize = buf.reduce((s, b) => s + b.length, 0);
          if (totalSize < 512 * 1024) { // keep up to 512KB per channel
            buf.push(Buffer.from(h264Data));
          }
        }

        const callbacks = conn.consumers.get(field3);
        if (callbacks && callbacks.size > 0) {
          for (const cb of callbacks) {
            cb(h264Data);
          }
        }
      }
    }

    // Keep data from the last header onwards (incomplete frame)
    const lastHdr = headers[headers.length - 1];
    accum = accum.slice(lastHdr);
  });

  socket.on('timeout', () => {
    log('warn', `[shared-${key}] Socket timeout`);
    conn.status = 'error';
  });

  socket.on('error', (err) => {
    log('error', `[shared-${key}] Socket error: ${err.message}`);
    conn.status = 'error';
  });

  socket.on('close', () => {
    log('info', `[shared-${key}] Socket closed`);
    conn.status = 'closed';
    // Only remove from map if this is still the current connection (race-condition guard)
    if (sharedConnections.get(key) === conn) {
      sharedConnections.delete(key);
    }
  });

  socket.connect(streamPort, cameraIp);
  sharedConnections.set(key, conn);
  return conn;
}

function releaseSharedConnection(conn, field3, callback) {
  const callbacks = conn.consumers.get(field3);
  if (callbacks) {
    callbacks.delete(callback);
    if (callbacks.size === 0) conn.consumers.delete(field3);
  }
  conn.refCount--;
  if (conn.refCount <= 0 && conn.socket) {
    conn.socket.destroy();
    sharedConnections.delete(conn.key);
    log('info', `[shared-${conn.key}] Last consumer left, connection closed`);
  }
}

// ─── Per-channel live stream ──────────────────────────────────────

/**
 * Start a live stream proxy for a specific camera channel.
 * @param {object} opts
 * @param {string} opts.cameraIp - Camera IP address
 * @param {number} opts.streamPort - Raw TCP stream port (default 12345)
 * @param {number} opts.channel - Channel number 0-3
 * @param {string} opts.hlsOutputDir - Directory for HLS output files
 * @param {string} opts.streamId - Unique stream identifier
 * @param {number} opts.fps - Expected framerate (default 25)
 */
// CloseLi protocol field3 → channel mapping
// channel = floor(field3/3), quality = field3%3 (0=main, 1=sub, 2=thumb)
// Main-quality streams: ch0→0, ch1→3, ch2→6, ch3→9
// Note: ch3 may only send thumbnail (f3=11) if no camera is connected
const CHANNEL_TO_FIELD3 = [0, 3, 6, 9];
const CHANNEL_FALLBACKS = { 0: [1, 2], 3: [4, 5], 6: [7, 8], 9: [10, 11] };

// Cached MediaMTX availability for live streams
let _mediaMtxLiveAvailable = false;
(async () => {
  _mediaMtxLiveAvailable = await checkMediaMtxLive();
  log('info', `[LiveProxy] MediaMTX WebRTC relay ${_mediaMtxLiveAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
})();
const _mtxLiveCheckTimer = setInterval(async () => {
  _mediaMtxLiveAvailable = await checkMediaMtxLive();
}, 30_000);
if (typeof _mtxLiveCheckTimer.unref === 'function') _mtxLiveCheckTimer.unref();

export function startLiveStream({ cameraIp, streamPort = 12345, channel = 0, hlsOutputDir, streamId, cameraId, fps = 25 }) {
  const rtspId = cameraId || streamId; // Use cameraId for RTSP/recording paths
  const mainField3 = CHANNEL_TO_FIELD3[channel] ?? (channel * 3); // use lookup, fallback to channel*3

  const state = {
    status: 'connecting',
    ffmpeg: null,
    error: null,
    frameCount: 0,
  };

  const hlsPath = path.join(hlsOutputDir, `${streamId}.m3u8`);
  const segPattern = path.join(hlsOutputDir, `${streamId}-%03d.ts`);
  fs.mkdirSync(hlsOutputDir, { recursive: true });

  let foundSps = false;
  // NOTE: spsBuffer/lastSpsNal/lastPpsNal are now per-callback (inside makeNalCallback)
  // to avoid mixing NAL data from different quality streams

  let nvencFailed = false; // Track if NVENC failed so we can fallback to CPU

  function startFfmpeg() {
    const outFps = Number(process.env.LIVE_OUT_FPS || 15);

    // Use copy mode (no transcoding) for fastest possible startup.
    // The raw H264 from the camera is already valid — re-encoding wastes time.
    log('info', `[${streamId}] STREAM MODE = COPY (live, no transcode)`);

    const args = [
      '-y',
      '-use_wallclock_as_timestamps', '1',
      '-fflags', '+genpts+discardcorrupt+nobuffer',
      '-flags', 'low_delay',
      '-err_detect', 'ignore_err',
      '-probesize', '200000',
      '-analyzeduration', '200000',
      '-framerate', String(outFps),
      '-f', 'h264',
      '-i', 'pipe:0',
      '-c:v', 'copy',
      '-bsf:v', 'dump_extra',
      '-an',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '6',
      '-hls_flags', 'delete_segments+append_list+omit_endlist+program_date_time',
      '-hls_segment_filename', segPattern,
      hlsPath,
    ];

    // ─── WebRTC: push copy to MediaMTX via RTSP ──────────────────
    // Check synchronously using cached value (set below)
    if (_mediaMtxLiveAvailable) {
      args.push(
        '-c:v', 'copy',
        '-an',
        '-f', 'rtsp',
        '-rtsp_transport', 'tcp',
        `${MEDIAMTX_RTSP_URL}/${rtspId}`,
      );
      log('info', `[${streamId}] WebRTC: pushing live to ${MEDIAMTX_RTSP_URL}/${rtspId}`);
    }

    // ─── Continuous recording to local disk ────────────────────────
    const autoRecEnabled = (process.env.AUTO_RECORD || 'true') !== 'false';
    const autoRecSegSec = Number(process.env.AUTO_RECORD_SEGMENT_SEC || 900);
    if (autoRecEnabled) {
      const recRoot = path.resolve(process.env.RECORDINGS_PATH || 'recordings');
      const recDir = path.join(recRoot, rtspId);
      fs.mkdirSync(recDir, { recursive: true });
      const recPattern = path.join(recDir, `${rtspId}_%Y-%m-%d_%H-%M-%S.mp4`);
      args.push(
        '-c:v', 'copy',
        '-an',
        '-f', 'segment',
        '-segment_time', String(autoRecSegSec),
        '-segment_format', 'mp4',
        '-reset_timestamps', '1',
        '-strftime', '1',
        '-movflags', '+frag_keyframe',
        recPattern,
      );
      log('info', `[${streamId}] Auto-recording live: ${autoRecSegSec}s segments → ${recDir}`);
    }

    log('info', `[${streamId}] Starting FFmpeg for channel ${channel} (copy mode)`);
    const ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    // Prevent unhandled 'error' events on stdin from crashing the server
    ffmpeg.stdin.on('error', (err) => {
      if (err.code !== 'EPIPE' && err.code !== 'EOF' && err.code !== 'ERR_STREAM_DESTROYED') {
        log('warn', `[${streamId}] FFmpeg stdin error: ${err.code || err.message}`);
      }
    });

    let lastProgressLogAt = 0;
    ffmpeg.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (!msg) return;

      const important =
        msg.includes('Error') ||
        msg.includes('Non-monotonic DTS') ||
        msg.includes('Opening') ||
        msg.includes('Output #') ||
        msg.includes('Stream #');

      const isProgress = msg.includes('frame=');
      const now = Date.now();

      if (important) {
        log('info', `[${streamId}] FFmpeg: ${msg.slice(0, 300)}`);
        return;
      }

      // Progress lines are very noisy — throttle them
      if (isProgress && now - lastProgressLogAt > 5000) {
        lastProgressLogAt = now;
        log('info', `[${streamId}] FFmpeg: ${msg.slice(0, 200)}`);
      }
    });

    ffmpeg.on('error', (err) => {
      log('error', `[${streamId}] FFmpeg error: ${err.message}`);
      state.status = 'error';
      state.error = err.message;
    });

    ffmpeg.on('close', (code) => {
      log('info', `[${streamId}] FFmpeg exited with code ${code}`);
      if (state.status !== 'stopped') {
        state.status = 'error';
        state.error = `FFmpeg exited with code ${code}`;
      }
    });

    return ffmpeg;
  }

  // lockedField3: once SPS is found, only accept data from this field3
  let lockedField3 = -1;

  // NAL data callback factory — each field3 gets its own SPS buffer
  // to avoid mixing NAL data from different quality streams.
  // They share foundSps/lockedField3 so only the first to find SPS wins.
  const makeNalCallback = (sourceF3) => {
    // Per-callback SPS detection state (isolated per quality stream)
    let mySpsBuffer = Buffer.alloc(0);
    let myLastSpsNal = null;
    let myLastPpsNal = null;

    return (nalBuf) => {
      if (state.status === 'stopped') return;
      // After SPS found, only accept data from the locked field3
      if (lockedField3 >= 0 && sourceF3 !== lockedField3) return;

      if (!foundSps) {
        mySpsBuffer = Buffer.concat([mySpsBuffer, nalBuf]);
        if (mySpsBuffer.length > 2 * 1024 * 1024) {
          mySpsBuffer = mySpsBuffer.slice(mySpsBuffer.length - 1024 * 1024);
        }

        // Find NAL start codes: both 00 00 00 01 (4-byte) and 00 00 01 (3-byte)
        const starts = [];
        for (let i = 0; i <= mySpsBuffer.length - 3; i++) {
          if (mySpsBuffer[i] === 0 && mySpsBuffer[i + 1] === 0) {
            if (i + 3 < mySpsBuffer.length && mySpsBuffer[i + 2] === 0 && mySpsBuffer[i + 3] === 1) {
              starts.push({ pos: i, len: 4 }); // 4-byte start code
              i += 3;
            } else if (mySpsBuffer[i + 2] === 1) {
              starts.push({ pos: i, len: 3 }); // 3-byte start code
              i += 2;
            }
          }
        }

        if (starts.length < 2) {
          state.status = 'buffering';
          return;
        }

        for (let s = 0; s < starts.length - 1; s++) {
          const start = starts[s].pos;
          const nalOffset = start + starts[s].len;
          const end = starts[s + 1].pos;
          if (nalOffset >= mySpsBuffer.length) continue;
          const nalType = mySpsBuffer[nalOffset] & 0x1f;

          if (nalType === NAL_TYPE_SPS) {
            myLastSpsNal = mySpsBuffer.slice(start, end);
          } else if (nalType === 8) {
            myLastPpsNal = mySpsBuffer.slice(start, end);
          } else if (nalType === 5 && myLastSpsNal && myLastPpsNal) {
            foundSps = true;
            lockedField3 = sourceF3;
            currentField3 = sourceF3;
            log('info', `[${streamId}] Found SPS/PPS/IDR for channel ${channel} (field3=${sourceF3})`);
            state.ffmpeg = startFfmpeg();
            try {
              if (state.ffmpeg && state.ffmpeg.stdin.writable) {
                state.ffmpeg.stdin.write(myLastSpsNal);
                state.ffmpeg.stdin.write(myLastPpsNal);
                state.ffmpeg.stdin.write(mySpsBuffer.slice(start));
              }
            } catch (writeErr) { /* pipe may have closed */ }
            state.status = 'streaming';
            state.frameCount++;
            mySpsBuffer = Buffer.alloc(0);
            return;
          }
        }

        state.status = 'buffering';
        return;
      }

      // Stream is running — pipe data to FFmpeg
      if (state.ffmpeg && state.ffmpeg.stdin.writable) {
        try {
          state.ffmpeg.stdin.write(nalBuf);
          state.frameCount++;
        } catch (writeErr) { /* pipe may have closed */ }
      }
    };
  };

  // Get or create shared connection
  const conn = getSharedConnection(cameraIp, streamPort);

  let currentField3 = mainField3;

  // Track all registered callbacks for cleanup
  const registeredCallbacks = new Map(); // field3 → callback

  function registerConsumer(f3) {
    const cb = makeNalCallback(f3);
    registeredCallbacks.set(f3, cb);
    if (!conn.consumers.has(f3)) {
      conn.consumers.set(f3, new Set());
    }
    conn.consumers.get(f3).add(cb);
    currentField3 = f3;

    // Replay early buffered data (contains SPS/PPS from connection start)
    const earlyBuf = conn.earlyBuffers.get(f3);
    if (earlyBuf && earlyBuf.length > 0) {
      const totalBytes = earlyBuf.reduce((s, b) => s + b.length, 0);
      log('info', `[${streamId}] Replaying ${earlyBuf.length} early packets (${totalBytes} bytes) for field3=${f3}`);
      for (const chunk of earlyBuf) {
        cb(chunk);
      }
      conn.earlyBuffers.delete(f3); // clear after replay
    }

    log('info', `[${streamId}] Registered for channel ${channel} (field3=${f3}) on shared connection`);
  }

  // Register on ALL candidate field3 values simultaneously (main + fallbacks)
  // This catches SPS/PPS from whichever quality stream sends it first
  const allField3s = [mainField3, ...(CHANNEL_FALLBACKS[mainField3] || [])];
  for (const f3 of allField3s) {
    registerConsumer(f3);
  }
  log('info', `[${streamId}] Listening on field3 values: [${allField3s.join(', ')}] for channel ${channel}`);

  // Once SPS is found and FFmpeg started, unregister from non-active field3s (cleanup timer)
  let fallbackTimer = setInterval(() => {
    if (state.status === 'stopped') { clearInterval(fallbackTimer); return; }
    if (foundSps) {
      clearInterval(fallbackTimer);
      // Unregister from all except the locked one
      for (const [f3, cb] of registeredCallbacks) {
        if (f3 === lockedField3) continue;
        const cbs = conn.consumers.get(f3);
        if (cbs) { cbs.delete(cb); if (cbs.size === 0) conn.consumers.delete(f3); }
        registeredCallbacks.delete(f3);
      }
      log('info', `[${streamId}] SPS found on field3=${lockedField3}, unregistered from others`);
    }
  }, 2000);

  return {
    get status() { return state.status; },
    get error() { return state.error; },
    get frameCount() { return state.frameCount; },
    get hlsUrl() { return `/hls/${streamId}.m3u8`; },

    stop() {
      state.status = 'stopped';
      if (fallbackTimer) clearInterval(fallbackTimer);
      // Unregister all callbacks from shared connection
      for (const [f3, cb] of registeredCallbacks) {
        const cbs = conn.consumers.get(f3);
        if (cbs) { cbs.delete(cb); if (cbs.size === 0) conn.consumers.delete(f3); }
      }
      registeredCallbacks.clear();
      conn.refCount--;
      if (conn.refCount <= 0 && conn.socket) {
        conn.socket.destroy();
        sharedConnections.delete(conn.key);
        log('info', `[shared-${conn.key}] Last consumer left, connection closed`);
      }
      if (state.ffmpeg) {
        state.ffmpeg.stdin.end();
        state.ffmpeg.kill('SIGTERM');
        setTimeout(() => {
          if (state.ffmpeg && !state.ffmpeg.killed) state.ffmpeg.kill('SIGKILL');
        }, 3000);
        state.ffmpeg = null;
      }
      try {
        const dir = hlsOutputDir;
        const files = fs.readdirSync(dir).filter(f => f.startsWith(streamId));
        for (const f of files) fs.unlinkSync(path.join(dir, f));
      } catch {}
      log('info', `[${streamId}] Live stream stopped (channel ${channel})`);
    },
  };
}
