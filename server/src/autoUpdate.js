/**
 * VIPO Vision — Auto Update Module
 *
 * Periodically checks GitHub for new commits. If an update is found:
 *   1. git pull
 *   2. npm install (root + server)
 *   3. npm run build (frontend)
 *   4. Restart the service (or process)
 *
 * Default: checks every 60 minutes.  Override with AUTO_UPDATE_INTERVAL_MS env var.
 * Disable with AUTO_UPDATE_ENABLED=false.
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from './sanitize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const UPDATE_INTERVAL_MS = Number(process.env.AUTO_UPDATE_INTERVAL_MS || 60 * 60_000); // 1 hour
const ENABLED = (process.env.AUTO_UPDATE_ENABLED || 'true').toLowerCase() !== 'false';

let lastCheck = null;
let lastUpdate = null;
let updateStatus = 'idle'; // idle | checking | updating | error
let lastError = null;

function run(cmd, cwd = PROJECT_ROOT) {
  return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * Check GitHub for updates and apply them if available.
 * @returns {{ updated: boolean, message: string }}
 */
export function checkForUpdates() {
  if (updateStatus === 'updating') {
    return { updated: false, message: 'Update already in progress' };
  }

  updateStatus = 'checking';
  lastCheck = new Date().toISOString();
  lastError = null;

  try {
    // Fetch latest from origin
    run('git fetch origin main');

    // Compare local HEAD with remote HEAD
    const localHash = run('git rev-parse HEAD');
    const remoteHash = run('git rev-parse origin/main');

    if (localHash === remoteHash) {
      updateStatus = 'idle';
      log('info', `[AutoUpdate] No updates available (${localHash.slice(0, 8)})`);
      return { updated: false, message: 'Already up to date' };
    }

    // Get commit summary
    const newCommits = run('git log --oneline HEAD..origin/main');
    const commitCount = newCommits.split('\n').filter(Boolean).length;
    log('info', `[AutoUpdate] ${commitCount} new commit(s) found, updating...`);

    updateStatus = 'updating';

    // Pull changes
    run('git pull origin main');
    log('info', '[AutoUpdate] Git pull complete');

    // Install dependencies (root)
    try {
      run('npm install --production=false', PROJECT_ROOT);
      log('info', '[AutoUpdate] Root dependencies updated');
    } catch (e) {
      log('warn', `[AutoUpdate] Root npm install warning: ${e.message}`);
    }

    // Install dependencies (server)
    try {
      run('npm install', path.join(PROJECT_ROOT, 'server'));
      log('info', '[AutoUpdate] Server dependencies updated');
    } catch (e) {
      log('warn', `[AutoUpdate] Server npm install warning: ${e.message}`);
    }

    // Rebuild frontend
    try {
      run('npm run build', PROJECT_ROOT);
      log('info', '[AutoUpdate] Frontend rebuilt');
    } catch (e) {
      log('warn', `[AutoUpdate] Build warning: ${e.message}`);
    }

    lastUpdate = new Date().toISOString();
    updateStatus = 'idle';
    log('info', `[AutoUpdate] Update complete! ${commitCount} commit(s) applied. Restarting...`);

    // Schedule restart — give time for the response to be sent
    setTimeout(() => {
      log('info', '[AutoUpdate] Restarting process...');
      process.exit(0); // The Windows service or nodemon will restart us
    }, 2000);

    return { updated: true, message: `Updated ${commitCount} commit(s). Restarting...` };

  } catch (err) {
    updateStatus = 'error';
    lastError = err.message;
    log('error', `[AutoUpdate] Failed: ${err.message}`);
    return { updated: false, message: `Update failed: ${err.message}` };
  }
}

/**
 * Returns the current auto-update status.
 */
export function getUpdateStatus() {
  return {
    enabled: ENABLED,
    status: updateStatus,
    lastCheck,
    lastUpdate,
    lastError,
    intervalMs: UPDATE_INTERVAL_MS,
    projectRoot: PROJECT_ROOT,
  };
}

/**
 * Starts the periodic update check.
 */
export function startAutoUpdate() {
  if (!ENABLED) {
    log('info', '[AutoUpdate] Disabled (AUTO_UPDATE_ENABLED=false)');
    return;
  }

  // Check if git repo exists
  try {
    run('git rev-parse --is-inside-work-tree');
  } catch {
    log('warn', '[AutoUpdate] Not a git repository, auto-update disabled');
    return;
  }

  log('info', `[AutoUpdate] Enabled — checking every ${Math.round(UPDATE_INTERVAL_MS / 60_000)} minutes`);

  // First check after 30 seconds (let server fully start)
  setTimeout(() => {
    checkForUpdates();
  }, 30_000);

  // Then check periodically
  const timer = setInterval(() => {
    checkForUpdates();
  }, UPDATE_INTERVAL_MS);

  if (typeof timer.unref === 'function') timer.unref();
}
