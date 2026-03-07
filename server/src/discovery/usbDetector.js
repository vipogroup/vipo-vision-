/**
 * VIPO Vision — USB Camera Detector
 *
 * Detects USB webcams connected to the computer.
 * Uses PowerShell on Windows, v4l2 on Linux, system_profiler on macOS.
 */

import { execSync } from 'child_process';
import os from 'os';
import { log } from '../sanitize.js';

function detectWindows() {
  const cameras = [];
  try {
    // Try PowerShell to get video input devices
    const cmd = `powershell -Command "Get-PnpDevice -Class Camera -Status OK | Select-Object FriendlyName, InstanceId | ConvertTo-Json -Compress"`;
    const output = execSync(cmd, { timeout: 5000, encoding: 'utf-8' });
    const parsed = JSON.parse(output);
    const devices = Array.isArray(parsed) ? parsed : [parsed];

    for (const dev of devices) {
      if (dev && dev.FriendlyName) {
        cameras.push({
          name: dev.FriendlyName,
          deviceId: dev.InstanceId || '',
          type: 'USB',
        });
      }
    }
  } catch {
    // Fallback: try WMIC
    try {
      const cmd2 = 'wmic path Win32_PnPEntity where "PNPClass=\'Camera\' OR PNPClass=\'Image\'" get Name /format:list';
      const output2 = execSync(cmd2, { timeout: 5000, encoding: 'utf-8' });
      const lines = output2.split('\n').filter((l) => l.startsWith('Name='));
      for (const line of lines) {
        const name = line.replace('Name=', '').trim();
        if (name) {
          cameras.push({ name, deviceId: '', type: 'USB' });
        }
      }
    } catch {
      log('warn', 'Could not detect USB cameras on Windows');
    }
  }
  return cameras;
}

function detectLinux() {
  const cameras = [];
  try {
    const output = execSync('ls /dev/video* 2>/dev/null', { timeout: 3000, encoding: 'utf-8' });
    const devices = output.trim().split('\n').filter(Boolean);

    for (const devPath of devices) {
      try {
        const info = execSync(`v4l2-ctl --device=${devPath} --info 2>/dev/null`, { timeout: 3000, encoding: 'utf-8' });
        const nameMatch = info.match(/Card\s+type\s*:\s*(.+)/i);
        cameras.push({
          name: nameMatch ? nameMatch[1].trim() : `USB Camera (${devPath})`,
          deviceId: devPath,
          type: 'USB',
        });
      } catch {
        cameras.push({ name: `USB Camera (${devPath})`, deviceId: devPath, type: 'USB' });
      }
    }
  } catch {
    log('warn', 'Could not detect USB cameras on Linux');
  }
  return cameras;
}

function detectMac() {
  const cameras = [];
  try {
    const output = execSync('system_profiler SPCameraDataType -json', { timeout: 5000, encoding: 'utf-8' });
    const parsed = JSON.parse(output);
    const cams = parsed.SPCameraDataType || [];
    for (const cam of cams) {
      cameras.push({
        name: cam._name || 'USB Camera',
        deviceId: cam.spcamera_unique_id || '',
        type: 'USB',
      });
    }
  } catch {
    log('warn', 'Could not detect USB cameras on macOS');
  }
  return cameras;
}

export function detectUsbCameras() {
  const platform = os.platform();
  log('info', `Detecting USB cameras on ${platform}...`);

  let cameras;
  switch (platform) {
    case 'win32':
      cameras = detectWindows();
      break;
    case 'linux':
      cameras = detectLinux();
      break;
    case 'darwin':
      cameras = detectMac();
      break;
    default:
      log('warn', `USB camera detection not supported on ${platform}`);
      cameras = [];
  }

  log('info', `Found ${cameras.length} USB camera(s)`);
  return cameras;
}
