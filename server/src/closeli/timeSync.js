/**
 * VIPO Vision — CloseLi Camera Time Sync
 *
 * Syncs the internal clock of CloseLi cameras to the server's system time
 * via Telnet. Each camera runs BusyBox Linux and supports `date -s` command.
 *
 * Usage:
 *   syncCameraTime('10.0.0.9')       — sync one camera
 *   syncAllCameras(cameraStore)       — sync all CloseLi cameras in store
 */

import { CloseLiTelnet } from './telnetHelper.js';
import { log } from '../sanitize.js';

/**
 * Format current date/time for BusyBox `date -s` command.
 * Format: "YYYY-MM-DD HH:MM:SS"
 */
function getDateString() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/**
 * Sync a single CloseLi camera's clock to the server time.
 * @param {string} ip — Camera IP address
 * @returns {{ success: boolean, ip: string, message: string, timeBefore?: string, timeAfter?: string }}
 */
export async function syncCameraTime(ip) {
  const telnet = new CloseLiTelnet(ip);
  try {
    await telnet.connect();

    // Read current camera time
    const beforeOutput = await telnet.cmd('date', 1500);
    const timeBefore = beforeOutput.trim().split('\n').pop()?.trim() || '';

    // Set time to server time
    const serverTime = getDateString();
    await telnet.cmd(`date -s "${serverTime}"`, 1500);

    // Also try to set the hardware clock if available
    await telnet.cmd('hwclock -w 2>/dev/null', 1000);

    // Verify
    const afterOutput = await telnet.cmd('date', 1500);
    const timeAfter = afterOutput.trim().split('\n').pop()?.trim() || '';

    telnet.close();

    log('info', `[TimeSync] ${ip}: synced to ${serverTime} (was: ${timeBefore})`);
    return { success: true, ip, message: 'Time synced', timeBefore, timeAfter, serverTime };
  } catch (err) {
    telnet.close();
    log('error', `[TimeSync] ${ip}: failed — ${err.message}`);
    return { success: false, ip, message: err.message };
  }
}

/**
 * Sync all CloseLi cameras found in the camera store.
 * @param {object} cameraStore — The camera store instance
 * @returns {Promise<Array>} — Results for each camera
 */
export async function syncAllCameras(cameraStore) {
  const cameras = cameraStore.getAll();
  const closeLiIps = new Set();

  for (const cam of cameras) {
    if (cam.brand === 'CloseLi' && cam.ip) {
      closeLiIps.add(cam.ip);
    }
  }

  if (closeLiIps.size === 0) {
    log('info', '[TimeSync] No CloseLi cameras found to sync');
    return [];
  }

  log('info', `[TimeSync] Syncing time on ${closeLiIps.size} CloseLi device(s)...`);

  const results = [];
  for (const ip of closeLiIps) {
    const result = await syncCameraTime(ip);
    results.push(result);
  }

  const ok = results.filter(r => r.success).length;
  const fail = results.filter(r => !r.success).length;
  log('info', `[TimeSync] Done: ${ok} synced, ${fail} failed`);

  return results;
}
