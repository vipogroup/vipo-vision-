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

const NAL_TYPE_SPS = 7;

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
    refCount: 1,
    status: 'connecting',
  };

  const socket = new net.Socket();
  conn.socket = socket;

  // Accumulation buffer for protocol parsing
  let accum = Buffer.alloc(0);

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
    sharedConnections.delete(key);
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
// CloseLi protocol field3 → channel mapping (discovered by analysis)
// Main-quality 1600x960 streams use field3: 0, 3, 6, 7
const CHANNEL_TO_FIELD3 = [0, 3, 6, 7];

export function startLiveStream({ cameraIp, streamPort = 12345, channel = 0, hlsOutputDir, streamId, fps = 25 }) {
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
  let spsBuffer = Buffer.alloc(0); // accumulate until SPS+PPS+IDR
  let lastSpsNal = null;
  let lastPpsNal = null;

  function startFfmpeg() {
    const args = [
      '-y',
      '-fflags', '+genpts+discardcorrupt',
      '-use_wallclock_as_timestamps', '1',
      '-f', 'h264',
      '-i', 'pipe:0',
      '-c:v', 'copy',
      '-bsf:v', 'dump_extra',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '4',
      '-hls_flags', 'delete_segments+append_list+independent_segments',
      '-hls_segment_filename', segPattern,
      hlsPath,
    ];

    log('info', `[${streamId}] Starting FFmpeg for channel ${channel} (copy mode)`);
    const ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });

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

  // NAL data callback — called by the shared connection for our channel
  const onNalData = (nalBuf) => {
    if (state.status === 'stopped') return;

    if (!foundSps) {
      spsBuffer = Buffer.concat([spsBuffer, nalBuf]);
      if (spsBuffer.length > 2 * 1024 * 1024) {
        spsBuffer = spsBuffer.slice(spsBuffer.length - 1024 * 1024);
      }

      const starts = [];
      for (let i = 0; i <= spsBuffer.length - 4; i++) {
        if (spsBuffer[i] === 0 && spsBuffer[i + 1] === 0 && spsBuffer[i + 2] === 0 && spsBuffer[i + 3] === 1) {
          starts.push(i);
        }
      }

      if (starts.length < 2) {
        state.status = 'buffering';
        return;
      }

      for (let s = 0; s < starts.length - 1; s++) {
        const start = starts[s];
        const end = starts[s + 1];
        if (start + 4 >= spsBuffer.length) continue;
        const nalType = spsBuffer[start + 4] & 0x1f;

        if (nalType === NAL_TYPE_SPS) {
          lastSpsNal = spsBuffer.slice(start, end);
        } else if (nalType === 8) {
          lastPpsNal = spsBuffer.slice(start, end);
        } else if (nalType === 5 && lastSpsNal && lastPpsNal) {
          foundSps = true;
          log('info', `[${streamId}] Found SPS/PPS/IDR for channel ${channel} (field3=${mainField3})`);
          state.ffmpeg = startFfmpeg();
          if (state.ffmpeg && state.ffmpeg.stdin.writable) {
            state.ffmpeg.stdin.write(lastSpsNal);
            state.ffmpeg.stdin.write(lastPpsNal);
            state.ffmpeg.stdin.write(spsBuffer.slice(start));
          }
          state.status = 'streaming';
          state.frameCount++;
          spsBuffer = Buffer.alloc(0);
          return;
        }
      }

      state.status = 'buffering';
      return;
    }

    // Stream is running — pipe data to FFmpeg
    if (state.ffmpeg && state.ffmpeg.stdin.writable) {
      state.ffmpeg.stdin.write(nalBuf);
      state.frameCount++;
    }
  };

  // Get or create shared connection
  const conn = getSharedConnection(cameraIp, streamPort);

  // Register our consumer for the main-quality field3 of our channel
  if (!conn.consumers.has(mainField3)) {
    conn.consumers.set(mainField3, new Set());
  }
  conn.consumers.get(mainField3).add(onNalData);
  log('info', `[${streamId}] Registered for channel ${channel} (field3=${mainField3}) on shared connection`);

  return {
    get status() { return state.status; },
    get error() { return state.error; },
    get frameCount() { return state.frameCount; },
    get hlsUrl() { return `/hls/${streamId}.m3u8`; },

    stop() {
      state.status = 'stopped';
      releaseSharedConnection(conn, mainField3, onNalData);
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
