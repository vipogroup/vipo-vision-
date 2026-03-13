/**
 * VIPO Vision — GPU Encoder Detection
 *
 * Detects whether NVIDIA NVENC (h264_nvenc) is available on the system
 * by querying FFmpeg's encoder list at startup.
 *
 * Provides helper functions to return the correct FFmpeg encoder arguments
 * with automatic fallback to libx264 if NVENC is unavailable or fails.
 */

import { execSync } from 'child_process';
import { log } from './sanitize.js';

let nvencAvailable = false;
let detectionDone = false;

/**
 * Detect whether h264_nvenc is available by running `ffmpeg -encoders`.
 * Called once on server startup.
 */
export function detectNvenc() {
  if (detectionDone) return nvencAvailable;
  detectionDone = true;

  try {
    const output = execSync('ffmpeg -encoders -hide_banner', {
      timeout: 10000,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (output.includes('h264_nvenc')) {
      nvencAvailable = true;
      log('info', '=== STREAM ENCODER = NVENC (h264_nvenc detected) ===');
    } else {
      nvencAvailable = false;
      log('info', '=== STREAM ENCODER = CPU (h264_nvenc not found, using libx264) ===');
    }
  } catch (err) {
    nvencAvailable = false;
    log('warn', `=== STREAM ENCODER = CPU (ffmpeg encoder detection failed: ${err.message}) ===`);
  }

  return nvencAvailable;
}

/**
 * @returns {boolean} Whether NVENC is available.
 */
export function isNvencAvailable() {
  return nvencAvailable;
}

/**
 * Returns encoder arguments for RTSP stream transcoding.
 *
 * NVENC:   -c:v h264_nvenc -preset p5 -tune ll -rc vbr -b:v 4M -maxrate 6M -bufsize 8M -g 30 -keyint_min 30 -sc_threshold 0
 * CPU:     -c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -b:v 1500k -maxrate 1500k -bufsize 3000k -g 30 -keyint_min 30 -sc_threshold 0
 */
export function getRtspTranscodeArgs(forceCpu = false) {
  if (nvencAvailable && !forceCpu) {
    return {
      encoder: 'nvenc',
      args: [
        '-c:v', 'h264_nvenc',
        '-preset', 'p5',
        '-tune', 'll',
        '-rc', 'vbr',
        '-b:v', '4M',
        '-maxrate', '6M',
        '-bufsize', '8M',
        '-g', '30',
        '-keyint_min', '30',
        '-sc_threshold', '0',
      ],
    };
  }
  return {
    encoder: 'cpu',
    args: [
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-profile:v', 'baseline',
      '-b:v', '1500k',
      '-maxrate', '1500k',
      '-bufsize', '3000k',
      '-g', '30',
      '-keyint_min', '30',
      '-sc_threshold', '0',
    ],
  };
}

/**
 * Returns encoder arguments for HTTP raw stream transcoding.
 *
 * NVENC:   -c:v h264_nvenc -preset p5 -tune ll -rc vbr -b:v 4M -maxrate 6M -bufsize 8M ...
 * CPU:     -c:v libx264 -preset veryfast -profile:v main -crf 22 -maxrate 5000k -bufsize 10000k ...
 */
export function getHttpTranscodeArgs(forceCpu = false) {
  if (nvencAvailable && !forceCpu) {
    return {
      encoder: 'nvenc',
      args: [
        '-c:v', 'h264_nvenc',
        '-preset', 'p5',
        '-tune', 'll',
        '-rc', 'vbr',
        '-b:v', '4M',
        '-maxrate', '6M',
        '-bufsize', '8M',
        '-g', '30',
        '-keyint_min', '30',
        '-sc_threshold', '0',
        '-force_key_frames', 'expr:gte(t,n_forced*2)',
      ],
    };
  }
  return {
    encoder: 'cpu',
    args: [
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-profile:v', 'main',
      '-crf', '22',
      '-maxrate', '5000k',
      '-bufsize', '10000k',
      '-g', '30',
      '-keyint_min', '30',
      '-sc_threshold', '0',
      '-force_key_frames', 'expr:gte(t,n_forced*2)',
    ],
  };
}

/**
 * Returns encoder arguments for recording to MP4.
 *
 * NVENC:   -c:v h264_nvenc -preset p5 -tune ll -rc vbr -b:v 4M -maxrate 6M -bufsize 8M -g 30 -keyint_min 30 -sc_threshold 0
 * CPU:     -c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -b:v 1500k -g 30 -keyint_min 30 -sc_threshold 0
 */
export function getRecordingArgs(forceCpu = false) {
  if (nvencAvailable && !forceCpu) {
    return {
      encoder: 'nvenc',
      args: [
        '-c:v', 'h264_nvenc',
        '-preset', 'p5',
        '-tune', 'll',
        '-rc', 'vbr',
        '-b:v', '4M',
        '-maxrate', '6M',
        '-bufsize', '8M',
        '-g', '30',
        '-keyint_min', '30',
        '-sc_threshold', '0',
      ],
    };
  }
  return {
    encoder: 'cpu',
    args: [
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-profile:v', 'baseline',
      '-b:v', '1500k',
      '-g', '30',
      '-keyint_min', '30',
      '-sc_threshold', '0',
    ],
  };
}

/**
 * Returns encoder arguments for CloseLi live stream transcoding.
 *
 * NVENC:   -c:v h264_nvenc -preset p5 -tune ll -rc vbr -b:v 4M -maxrate 6M -bufsize 8M -g 30 -keyint_min 30 -sc_threshold 0
 * CPU:     -c:v libx264 -preset {preset} -tune zerolatency -profile:v {profile} -crf {crf} -maxrate {maxrate} -bufsize {bufsize} -g 30 -keyint_min 30 -sc_threshold 0
 */
export function getLiveTranscodeArgs({ preset = 'veryfast', crf = '23', profile = 'main', maxrate = '2500k', bufsize = '5000k', forceCpu = false } = {}) {
  if (nvencAvailable && !forceCpu) {
    return {
      encoder: 'nvenc',
      args: [
        '-c:v', 'h264_nvenc',
        '-preset', 'p5',
        '-tune', 'll',
        '-rc', 'vbr',
        '-b:v', '4M',
        '-maxrate', '6M',
        '-bufsize', '8M',
        '-g', '30',
        '-keyint_min', '30',
        '-sc_threshold', '0',
      ],
    };
  }
  return {
    encoder: 'cpu',
    args: [
      '-c:v', 'libx264',
      '-preset', preset,
      '-tune', 'zerolatency',
      '-profile:v', profile,
      '-crf', crf,
      '-maxrate', maxrate,
      '-bufsize', bufsize,
      '-g', '30',
      '-keyint_min', '30',
      '-sc_threshold', '0',
    ],
  };
}
