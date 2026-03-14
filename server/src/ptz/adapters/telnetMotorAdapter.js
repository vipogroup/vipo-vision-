/**
 * VIPO Vision — Telnet Motor PTZ Adapter
 *
 * Controls CloseLi camera motors via Telnet + motor_probe binary.
 * Uses the existing CloseLiTelnet class for connection management.
 *
 * Motor mapping (configurable per camera):
 *   /dev/motor  (dev 0) → Pan / Tilt (primary, xmax=500, ymax=250)
 *   /dev/motor1 (dev 1) → Zoom (tentative, xmax=200, ymax=100)
 *   /dev/motor2 (dev 2) → Focus (tentative, xmax=200, ymax=100)
 */

import { CloseLiTelnet } from '../../closeli/telnetHelper.js';
import { log } from '../../sanitize.js';

// ─── Default motor configuration ─────────────────────────────────────

const DEFAULT_MOTOR_CONFIG = {
  motorBinaryPath: '/config/motor_probe',
  motorMap: {
    panTiltDevice: 0,   // /dev/motor
    zoomDevice: 1,      // /dev/motor1 (tentative)
    focusDevice: 2,     // /dev/motor2 (tentative)
  },
  limits: {
    panMax: 500,
    tiltMax: 250,
    zoomMax: 200,
  },
  defaultStep: {
    panTilt: 20,
    zoom: 10,
  },
  speed: 200,
  commandTimeoutMs: 5000,
  telnetPort: 23,
};

// ─── Telnet connection pool (one per camera IP) ──────────────────────

const pool = new Map();
const POOL_TTL = 30000; // Keep connection alive for 30s

async function getTelnet(camera) {
  const ip = camera.ip;
  const existing = pool.get(ip);
  if (existing && existing.telnet.sock && !existing.telnet.sock.destroyed) {
    existing.lastUsed = Date.now();
    return existing.telnet;
  }

  // Clean up old connection
  if (existing) {
    try { existing.telnet.close(); } catch { /* */ }
    pool.delete(ip);
  }

  const cfg = getMotorConfig(camera);
  const telnet = new CloseLiTelnet(ip, cfg.telnetPort, cfg.commandTimeoutMs);
  await telnet.connect();

  pool.set(ip, { telnet, lastUsed: Date.now() });

  return telnet;
}

function releaseTelnet(ip) {
  // Don't close — let the pool TTL handle it
}

// Pool cleanup interval
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of pool) {
    if (now - entry.lastUsed > POOL_TTL) {
      try { entry.telnet.close(); } catch { /* */ }
      pool.delete(ip);
    }
  }
}, 15000);

// ─── Config helper ───────────────────────────────────────────────────

function getMotorConfig(camera) {
  return { ...DEFAULT_MOTOR_CONFIG, ...(camera.motorConfig || {}) };
}

// ─── Command execution ───────────────────────────────────────────────

async function exec(camera, args, waitMs = 2000) {
  const cfg = getMotorConfig(camera);
  const command = `${cfg.motorBinaryPath} ${args}`;

  log('info', `[${camera.id}] MOTOR CMD: ${command}`);

  let telnet;
  try {
    telnet = await getTelnet(camera);
  } catch (err) {
    log('error', `[${camera.id}] Telnet connect failed: ${err.message}`);
    throw new Error(`Telnet unavailable for ${camera.ip}: ${err.message}`);
  }

  try {
    const output = await telnet.cmd(command, waitMs);
    log('info', `[${camera.id}] MOTOR OUT: ${output.substring(0, 200)}`);
    return output;
  } catch (err) {
    log('error', `[${camera.id}] Motor command failed: ${err.message}`);
    // Close broken connection
    try { telnet.close(); } catch { /* */ }
    pool.delete(camera.ip);
    throw new Error(`Motor command failed: ${err.message}`);
  }
}

// ─── Status parsing ──────────────────────────────────────────────────

function parseStatusOutput(output) {
  // Parse output from: motor_probe status
  // Format per device:
  //   /dev/motorN:
  //     int32 fields: [0]=X [1]=Y [2]=X2 [3]=Y2 [4]=spdX [5]=spdY [6]=flags [7]=0
  const devices = {};
  const lines = output.split('\n');

  let currentDev = null;
  for (const line of lines) {
    const devMatch = line.match(/\/dev\/(motor\d*)/);
    if (devMatch) {
      currentDev = devMatch[1];
      devices[currentDev] = { x: 0, y: 0, xSpeed: 0, ySpeed: 0, flags: 0 };
    }
    if (currentDev) {
      const fieldMatch = line.match(/int32 fields:\s*(.+)/);
      if (fieldMatch) {
        const pairs = fieldMatch[1].match(/\[(\d+)\]=(-?\d+)/g);
        if (pairs) {
          const vals = {};
          for (const p of pairs) {
            const m = p.match(/\[(\d+)\]=(-?\d+)/);
            if (m) vals[parseInt(m[1])] = parseInt(m[2]);
          }
          devices[currentDev] = {
            x: vals[0] || 0,
            y: vals[1] || 0,
            x2: vals[2] || 0,
            y2: vals[3] || 0,
            xSpeed: vals[4] || 0,
            ySpeed: vals[5] || 0,
            flags: vals[6] || 0,
          };
        }
      }
    }
  }

  return devices;
}

// ─── Safety: clamp step values ───────────────────────────────────────

function clampStep(value, max) {
  const absMax = Math.abs(max);
  return Math.max(-absMax, Math.min(absMax, value));
}

// ─── Direction to step mapping ───────────────────────────────────────

function directionToSteps(direction, stepSize) {
  switch (direction) {
    case 'left':  return { x: -stepSize, y: 0 };
    case 'right': return { x: stepSize,  y: 0 };
    case 'up':    return { x: 0, y: -stepSize };
    case 'down':  return { x: 0, y: stepSize };
    default:      return { x: 0, y: 0 };
  }
}

// ─── Adapter interface ───────────────────────────────────────────────

export const telnetMotorAdapter = {
  async move(camera, direction, speed) {
    const cfg = getMotorConfig(camera);
    const dev = cfg.motorMap.panTiltDevice;
    const stepSize = cfg.defaultStep.panTilt;
    const steps = directionToSteps(direction, stepSize);

    // Clamp within limits
    steps.x = clampStep(steps.x, cfg.limits.panMax);
    steps.y = clampStep(steps.y, cfg.limits.tiltMax);

    if (steps.x === 0 && steps.y === 0) {
      log('warn', `[${camera.id}] Invalid PTZ direction: ${direction}`);
      return;
    }

    await exec(camera, `move ${dev} ${steps.x} ${steps.y}`, 3000);
  },

  async stop(camera) {
    const cfg = getMotorConfig(camera);
    const dev = cfg.motorMap.panTiltDevice;
    await exec(camera, `stop ${dev}`, 2000);
  },

  async zoom(camera, mode, value) {
    const cfg = getMotorConfig(camera);
    const dev = cfg.motorMap.zoomDevice;
    const stepSize = cfg.defaultStep.zoom;

    let x = 0;
    switch (mode) {
      case 'in':   x = stepSize; break;
      case 'out':  x = -stepSize; break;
      case 'stop':
        await exec(camera, `stop ${dev}`, 2000);
        return;
      default:
        log('warn', `[${camera.id}] Unknown zoom mode: ${mode}`);
        return;
    }

    x = clampStep(x, cfg.limits.zoomMax);
    await exec(camera, `move ${dev} ${x} 0`, 3000);
  },

  async getStatus(camera) {
    const cfg = getMotorConfig(camera);
    const output = await exec(camera, 'status', 3000);
    const devices = parseStatusOutput(output);

    // Map devices to roles
    const ptDev = ['motor', 'motor1', 'motor2'][cfg.motorMap.panTiltDevice] || 'motor';
    const zmDev = ['motor', 'motor1', 'motor2'][cfg.motorMap.zoomDevice] || 'motor1';

    const pt = devices[ptDev] || { x: 0, y: 0 };
    const zm = devices[zmDev] || { x: 0, y: 0 };

    return {
      success: true,
      adapter: 'closeli-motor',
      pan: pt.x,
      tilt: pt.y,
      zoom: zm.x,
      limits: cfg.limits,
      devices,
    };
  },

  // Presets — not yet implemented for motor control
  async getPresets(_camera) {
    return [];
  },

  async gotoPreset(camera, presetId) {
    log('warn', `[${camera.id}] Motor presets not yet implemented (preset=${presetId})`);
    throw new Error('Motor presets not yet implemented');
  },

  async savePreset(camera, name) {
    log('warn', `[${camera.id}] Motor preset save not yet implemented (name=${name})`);
    throw new Error('Motor preset save not yet implemented');
  },

  async deletePreset(camera, presetId) {
    log('warn', `[${camera.id}] Motor preset delete not yet implemented (preset=${presetId})`);
    throw new Error('Motor preset delete not yet implemented');
  },
};
