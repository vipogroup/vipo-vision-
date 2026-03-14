/**
 * One-time setup script: Patch CloseLi cameras with closeli-motor PTZ config.
 *
 * Usage:  node server/setup-motor-ptz.mjs
 *
 * This reads server/data/cameras.json, finds cameras with ip 10.0.0.x
 * (CloseLi cameras), and sets ptzType + motorConfig on them.
 * Safe to run multiple times — idempotent.
 */

import fs from 'fs';
import path from 'path';

const CAMERAS_FILE = path.resolve('server/data/cameras.json');

const MOTOR_CONFIG = {
  motorBinaryPath: '/config/motor_probe',
  motorMap: {
    panTiltDevice: 0,
    zoomDevice: 1,
    focusDevice: 2,
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

if (!fs.existsSync(CAMERAS_FILE)) {
  console.log('No cameras.json found. Nothing to patch.');
  process.exit(0);
}

const raw = fs.readFileSync(CAMERAS_FILE, 'utf-8');
const cameras = JSON.parse(raw);
let patched = 0;

for (const cam of cameras) {
  // Match CloseLi cameras by IP pattern (10.0.0.x) or brand
  const isCloseLi =
    (cam.ip && cam.ip.startsWith('10.0.0.')) ||
    (cam.brand && cam.brand.toLowerCase().includes('closeli'));

  if (!isCloseLi) continue;

  const changed = [];

  if (cam.ptzType !== 'closeli-motor') {
    cam.ptzType = 'closeli-motor';
    changed.push('ptzType');
  }
  if (!cam.ptzSupported) {
    cam.ptzSupported = true;
    changed.push('ptzSupported');
  }
  if (!cam.zoomSupported) {
    cam.zoomSupported = true;
    changed.push('zoomSupported');
  }
  if (!cam.motorConfig) {
    cam.motorConfig = MOTOR_CONFIG;
    changed.push('motorConfig');
  }
  if (!cam.panRange || cam.panRange[0] === 0 && cam.panRange[1] === 0) {
    cam.panRange = [0, 500];
    changed.push('panRange');
  }
  if (!cam.tiltRange || cam.tiltRange[0] === 0 && cam.tiltRange[1] === 0) {
    cam.tiltRange = [0, 250];
    changed.push('tiltRange');
  }
  if (cam.maxZoom <= 1) {
    cam.maxZoom = 200;
    changed.push('maxZoom');
  }

  if (changed.length > 0) {
    patched++;
    console.log(`  ✓ ${cam.id} (${cam.name || cam.ip}): ${changed.join(', ')}`);
  } else {
    console.log(`  – ${cam.id} (${cam.name || cam.ip}): already configured`);
  }
}

if (patched > 0) {
  // Backup original
  const backup = CAMERAS_FILE + '.bak-' + Date.now();
  fs.copyFileSync(CAMERAS_FILE, backup);
  console.log(`\nBackup saved: ${backup}`);

  fs.writeFileSync(CAMERAS_FILE, JSON.stringify(cameras, null, 2), 'utf-8');
  console.log(`Patched ${patched} camera(s). Done.`);
} else {
  console.log('\nNo cameras needed patching.');
}
