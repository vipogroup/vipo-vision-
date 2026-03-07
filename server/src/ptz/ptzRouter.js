/**
 * VIPO Vision — PTZ Router
 *
 * REST endpoints for PTZ control with per-camera rate limiting.
 */

import { Router } from 'express';
import { cameraStore } from '../cameraStore.js';
import { ptzService } from './ptzService.js';
import { log } from '../sanitize.js';

const router = Router();

// ─── Rate Limiter (token bucket, 10 req/sec per camera) ────────────

const buckets = new Map();
const MAX_TOKENS = 10;
const REFILL_RATE = 10; // tokens per second

function checkRateLimit(cameraId) {
  const now = Date.now();
  let bucket = buckets.get(cameraId);
  if (!bucket) {
    bucket = { tokens: MAX_TOKENS, lastRefill: now };
    buckets.set(cameraId, bucket);
  }

  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + elapsed * REFILL_RATE);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    return false;
  }
  bucket.tokens -= 1;
  return true;
}

function getCamera(req, res) {
  const { cameraId } = req.params;
  const camera = cameraStore.getById(cameraId);
  if (!camera) {
    res.status(404).json({ success: false, message: `Camera ${cameraId} not found` });
    return null;
  }
  if (!checkRateLimit(cameraId)) {
    res.status(429).json({ success: false, message: 'PTZ rate limit exceeded (10 req/sec)' });
    return null;
  }
  return camera;
}

// ─── Move ───────────────────────────────────────────────────────────

router.post('/:cameraId/move', async (req, res) => {
  const camera = getCamera(req, res);
  if (!camera) return;

  const { direction, speed } = req.body;
  if (!direction) {
    return res.status(400).json({ success: false, message: 'direction is required' });
  }

  try {
    await ptzService.move(camera, direction, speed || 5);
    res.json({ success: true });
  } catch (err) {
    log('error', `[${camera.id}] PTZ move error: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Stop ───────────────────────────────────────────────────────────

router.post('/:cameraId/stop', async (req, res) => {
  const camera = getCamera(req, res);
  if (!camera) return;

  try {
    await ptzService.stop(camera);
    res.json({ success: true });
  } catch (err) {
    log('error', `[${camera.id}] PTZ stop error: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Zoom ───────────────────────────────────────────────────────────

router.post('/:cameraId/zoom', async (req, res) => {
  const camera = getCamera(req, res);
  if (!camera) return;

  const { mode, value } = req.body;
  if (!mode) {
    return res.status(400).json({ success: false, message: 'mode is required (in|out|set|stop)' });
  }

  try {
    await ptzService.zoom(camera, mode, value);
    res.json({ success: true });
  } catch (err) {
    log('error', `[${camera.id}] PTZ zoom error: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Presets ────────────────────────────────────────────────────────

router.get('/:cameraId/presets', async (req, res) => {
  const camera = getCamera(req, res);
  if (!camera) return;

  try {
    const presets = await ptzService.getPresets(camera);
    res.json({ success: true, presets });
  } catch (err) {
    log('error', `[${camera.id}] PTZ getPresets error: ${err.message}`);
    res.json({ success: true, presets: [] });
  }
});

router.post('/:cameraId/presets/go', async (req, res) => {
  const camera = getCamera(req, res);
  if (!camera) return;

  const { presetId } = req.body;
  if (!presetId) {
    return res.status(400).json({ success: false, message: 'presetId is required' });
  }

  try {
    await ptzService.gotoPreset(camera, presetId);
    res.json({ success: true });
  } catch (err) {
    log('error', `[${camera.id}] PTZ gotoPreset error: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:cameraId/presets/save', async (req, res) => {
  const camera = getCamera(req, res);
  if (!camera) return;

  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, message: 'name is required' });
  }

  try {
    const preset = await ptzService.savePreset(camera, name);
    res.json({ success: true, preset });
  } catch (err) {
    log('error', `[${camera.id}] PTZ savePreset error: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:cameraId/presets/:presetId', async (req, res) => {
  const camera = getCamera(req, res);
  if (!camera) return;

  try {
    await ptzService.deletePreset(camera, req.params.presetId);
    res.json({ success: true });
  } catch (err) {
    log('error', `[${camera.id}] PTZ deletePreset error: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Status ─────────────────────────────────────────────────────────

router.get('/:cameraId/status', (req, res) => {
  const camera = getCamera(req, res);
  if (!camera) return;

  res.json({
    success: true,
    ptzAvailable: ptzService.isPtzAvailable(camera),
    ptzType: camera.ptzType || 'none',
    lastMove: ptzService.getLastMove(camera.id),
  });
});

export { router as ptzRouter };
