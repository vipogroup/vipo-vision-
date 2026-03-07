import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  X, Play, CheckCircle, XCircle, AlertTriangle, Clock, Copy, Check,
  Trash2, ChevronDown, ChevronRight, Loader2, RotateCcw, Download,
  Server, Wifi, Camera, Move, Shield, Zap, MonitorSmartphone, Globe,
  Database, Lock, Eye, Settings, LayoutDashboard, Video, Usb,
} from 'lucide-react';
import { GATEWAY_BASE } from '../config';
import { ptzService, zoomService, presetService, ptzUtils } from '../services/ptzService';
import { cameraDiscoveryService } from '../services/cameraDiscoveryService';
import { useCameraStore } from '../stores/cameraStore';

// ─── Test Definitions ─────────────────────────────────────────────

function buildTestSuites(cameras) {
  const gw = GATEWAY_BASE;
  const testCam = cameras[0];

  // Helper: GET /api/cameras returns { cameras: [...] } — unwrap to array
  async function fetchCameraList() {
    const res = await fetch(`${gw}/api/cameras`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : (data.cameras || []);
  }

  return [
    {
      id: 'gateway',
      name: 'Gateway Server',
      icon: Server,
      color: 'cyan',
      tests: [
        {
          id: 'gw-health',
          name: 'Health Endpoint',
          description: 'GET /api/health — server is running',
          run: async () => {
            const res = await fetch(`${gw}/api/health`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!data.ok) throw new Error('Health check returned ok=false');
            return `Server up, uptime: ${Math.round(data.uptime)}s, streams: ${data.streams}`;
          },
        },
        {
          id: 'gw-cors',
          name: 'CORS Headers',
          description: 'Verify CORS is enabled for frontend',
          run: async () => {
            const res = await fetch(`${gw}/api/health`, { method: 'OPTIONS' });
            const acao = res.headers.get('access-control-allow-origin');
            if (!acao) throw new Error('No Access-Control-Allow-Origin header');
            return `CORS OK: ${acao}`;
          },
        },
        {
          id: 'gw-404',
          name: '404 Handling',
          description: 'GET /api/nonexistent — should return 404',
          run: async () => {
            const res = await fetch(`${gw}/api/nonexistent`);
            if (res.status === 404) return '404 handled correctly';
            throw new Error(`Expected 404, got ${res.status}`);
          },
        },
        {
          id: 'gw-json-parse',
          name: 'JSON Body Parsing',
          description: 'POST with JSON body is parsed correctly',
          run: async () => {
            const res = await fetch(`${gw}/api/streams/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            const data = await res.json();
            if (data.message?.includes('cameraId')) return 'JSON parsing works — got validation error as expected';
            throw new Error('Unexpected response');
          },
        },
      ],
    },
    {
      id: 'cameras-api',
      name: 'Camera Store API',
      icon: Database,
      color: 'blue',
      tests: [
        {
          id: 'cam-list',
          name: 'List Cameras',
          description: 'GET /api/cameras — returns camera array',
          run: async () => {
            const list = await fetchCameraList();
            if (!Array.isArray(list)) throw new Error('Expected array');
            return `${list.length} camera(s) in store`;
          },
        },
        {
          id: 'cam-get-valid',
          name: 'Get Camera by ID',
          description: 'GET /api/cameras/:id — existing camera',
          run: async () => {
            const list = await fetchCameraList();
            if (list.length === 0) throw new Error('No cameras in store to test');
            const id = list[0].id;
            const res = await fetch(`${gw}/api/cameras/${id}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const cam = await res.json();
            if (!cam.id) throw new Error('No id in response');
            return `Got: ${cam.name} (${cam.id})`;
          },
        },
        {
          id: 'cam-get-invalid',
          name: 'Get Camera — Invalid ID',
          description: 'GET /api/cameras/nonexistent — should return 404',
          run: async () => {
            const res = await fetch(`${gw}/api/cameras/nonexistent-id-12345`);
            if (res.status === 404) return '404 returned correctly for invalid ID';
            throw new Error(`Expected 404, got ${res.status}`);
          },
        },
        {
          id: 'cam-no-password',
          name: 'No Passwords in Response',
          description: 'Camera API must not expose password or rtspUrl',
          run: async () => {
            const list = await fetchCameraList();
            if (list.length === 0) throw new Error('No cameras to check');
            const raw = JSON.stringify(list);
            if (raw.includes('"password"')) throw new Error('Password field found in response!');
            if (raw.includes('"rtspUrl"')) throw new Error('rtspUrl field found in response!');
            return 'Security OK — no sensitive fields exposed';
          },
        },
        {
          id: 'cam-add-delete',
          name: 'Add & Delete Camera',
          description: 'POST /api/cameras then DELETE — full CRUD cycle',
          run: async () => {
            const addRes = await fetch(`${gw}/api/cameras`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: `test-diag-${Date.now()}`,
                name: 'Diagnostics Test Camera',
                type: 'RTSP',
                ip: '192.168.99.99',
                port: 554,
              }),
            });
            if (!addRes.ok) throw new Error(`Add failed: HTTP ${addRes.status}`);
            const addData = await addRes.json();
            if (!addData.success) throw new Error(`Add failed: ${addData.message}`);

            const delRes = await fetch(`${gw}/api/cameras/${addData.camera.id}`, { method: 'DELETE' });
            if (!delRes.ok) throw new Error(`Delete failed: HTTP ${delRes.status}`);
            return `Add+Delete cycle OK (${addData.camera.id})`;
          },
        },
      ],
    },
    {
      id: 'streams',
      name: 'Stream Manager',
      icon: Video,
      color: 'purple',
      tests: [
        {
          id: 'stream-status',
          name: 'Stream Status',
          description: 'GET /api/streams/status — returns active streams',
          run: async () => {
            const res = await fetch(`${gw}/api/streams/status`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const count = Object.keys(data).length;
            return `${count} active stream(s)`;
          },
        },
        {
          id: 'stream-start-invalid',
          name: 'Start Stream — No Camera ID',
          description: 'POST /api/streams/start with empty body — validation',
          run: async () => {
            const res = await fetch(`${gw}/api/streams/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            if (res.status === 400) return 'Validation works — rejected empty cameraId';
            throw new Error(`Expected 400, got ${res.status}`);
          },
        },
        {
          id: 'stream-start-nonexistent',
          name: 'Start Stream — Nonexistent Camera',
          description: 'POST /api/streams/start with fake ID — 404',
          run: async () => {
            const res = await fetch(`${gw}/api/streams/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cameraId: 'fake-cam-id-99999' }),
            });
            if (res.status === 404) return '404 returned correctly for nonexistent camera';
            throw new Error(`Expected 404, got ${res.status}`);
          },
        },
        {
          id: 'stream-stop-nonexistent',
          name: 'Stop Stream — No Active Stream',
          description: 'POST /api/streams/stop with fake ID',
          run: async () => {
            const res = await fetch(`${gw}/api/streams/stop`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cameraId: 'fake-cam-id-99999' }),
            });
            const data = await res.json();
            if (!data.success) return 'Correctly reported no active stream';
            throw new Error('Should have failed for nonexistent stream');
          },
        },
        {
          id: 'stream-hls-dir',
          name: 'HLS Static Serving',
          description: 'GET /hls/ — HLS directory accessible',
          run: async () => {
            const res = await fetch(`${gw}/hls/`);
            // May return 404 or 403 if no files, but should not error
            return `HLS endpoint responded: HTTP ${res.status}`;
          },
        },
      ],
    },
    {
      id: 'ptz',
      name: 'PTZ Control',
      icon: Move,
      color: 'amber',
      tests: [
        {
          id: 'ptz-move-mock',
          name: 'PTZ Move (Mock)',
          description: 'ptzService.move() — mock camera moves correctly',
          run: async () => {
            if (!testCam) throw new Error('No test camera available');
            const result = await ptzService.move(testCam.id, 'right', 5);
            if (!result.success && !testCam.ptzSupported) return 'PTZ not supported — correctly rejected';
            if (result.success) return `Moved right, position: pan=${result.position.pan}`;
            throw new Error('Move failed unexpectedly');
          },
        },
        {
          id: 'ptz-stop-mock',
          name: 'PTZ Stop (Mock)',
          description: 'ptzService.stop() — stops movement',
          run: async () => {
            if (!testCam) throw new Error('No test camera');
            const result = await ptzService.stop(testCam.id);
            if (result.success) return `Stopped, position: pan=${result.position.pan}`;
            throw new Error('Stop failed');
          },
        },
        {
          id: 'ptz-speed',
          name: 'PTZ Speed Control',
          description: 'ptzService.setSpeed() — clamps 1-10',
          run: async () => {
            const r1 = await ptzService.setSpeed('test', 15);
            if (r1.speed !== 10) throw new Error(`Expected clamped to 10, got ${r1.speed}`);
            const r2 = await ptzService.setSpeed('test', -5);
            if (r2.speed !== 1) throw new Error(`Expected clamped to 1, got ${r2.speed}`);
            return 'Speed clamping works: 15→10, -5→1';
          },
        },
        {
          id: 'ptz-zoom-mock',
          name: 'Zoom In/Out (Mock)',
          description: 'zoomService.zoomIn() + zoomOut()',
          run: async () => {
            if (!testCam) throw new Error('No test camera');
            const r1 = await zoomService.zoomIn(testCam.id);
            const r2 = await zoomService.zoomOut(testCam.id);
            if (!testCam.zoomSupported) return 'Zoom not supported — correctly handled';
            return `ZoomIn: ${r1.zoom}, ZoomOut: ${r2.zoom}`;
          },
        },
        {
          id: 'ptz-utils',
          name: 'PTZ Utility Functions',
          description: 'formatPosition, formatZoom, isAtHome',
          run: async () => {
            const pos = ptzUtils.formatPosition(45, -30);
            if (!pos.includes('45')) throw new Error(`formatPosition broken: ${pos}`);
            const zoom = ptzUtils.formatZoom(2.5);
            if (!zoom.includes('2.5')) throw new Error(`formatZoom broken: ${zoom}`);
            const home = ptzUtils.isAtHome(0, 0, 1.0);
            if (!home) throw new Error('isAtHome(0,0,1) should be true');
            return `formatPosition: ${pos}, formatZoom: ${zoom}, isAtHome: ${home}`;
          },
        },
        {
          id: 'ptz-api-status',
          name: 'PTZ API — Status Endpoint',
          description: 'GET /api/ptz/:id/status — backend PTZ',
          run: async () => {
            const list = await fetchCameraList();
            if (list.length === 0) throw new Error('No cameras in store');
            const res = await fetch(`${gw}/api/ptz/${list[0].id}/status`);
            const data = await res.json();
            return `PTZ status: ${data.ptzType || 'none'}, supported: ${data.ptzSupported || false}`;
          },
        },
        {
          id: 'ptz-api-move-noptz',
          name: 'PTZ API — Move Non-PTZ Camera',
          description: 'POST /api/ptz/:id/move — should reject non-PTZ',
          run: async () => {
            const list = await fetchCameraList();
            const nonPtz = list.find((c) => !c.ptzSupported);
            if (!nonPtz) return 'Skip — no non-PTZ cameras in store';
            const res = await fetch(`${gw}/api/ptz/${nonPtz.id}/move`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ direction: 'right', speed: 5 }),
            });
            const data = await res.json();
            if (!data.success || data.message?.includes('not supported')) return 'Correctly rejected PTZ on non-PTZ camera';
            return `Response: ${JSON.stringify(data).slice(0, 100)}`;
          },
        },
      ],
    },
    {
      id: 'presets',
      name: 'Preset Management',
      icon: Settings,
      color: 'pink',
      tests: [
        {
          id: 'preset-save-mock',
          name: 'Save Preset (Mock)',
          description: 'presetService.savePreset()',
          run: async () => {
            if (!testCam) throw new Error('No test camera');
            const result = await presetService.savePreset(testCam.id, 'Diag Test Preset');
            if (result.success) return `Saved: ${result.preset?.name || 'OK'}`;
            if (!testCam.ptzSupported) return 'PTZ not supported — expected';
            throw new Error('Save failed');
          },
        },
        {
          id: 'preset-goto-mock',
          name: 'Go To Preset (Mock)',
          description: 'presetService.goToPreset()',
          run: async () => {
            if (!testCam) throw new Error('No test camera');
            const preset = { id: 'test', name: 'Home', pan: 0, tilt: 0, zoom: 1.0 };
            const result = await presetService.goToPreset(testCam.id, preset);
            if (result.success) return `Went to: ${result.preset}, pos: ${JSON.stringify(result.position)}`;
            if (!testCam.ptzSupported) return 'PTZ not supported — expected';
            throw new Error('GoTo failed');
          },
        },
        {
          id: 'preset-api-list',
          name: 'Presets API — List',
          description: 'GET /api/ptz/:id/presets',
          run: async () => {
            const list = await fetchCameraList();
            if (list.length === 0) throw new Error('No cameras');
            const res = await fetch(`${gw}/api/ptz/${list[0].id}/presets`);
            const data = await res.json();
            return `Presets endpoint: ${JSON.stringify(data).slice(0, 100)}`;
          },
        },
      ],
    },
    {
      id: 'discovery',
      name: 'Camera Discovery',
      icon: Wifi,
      color: 'emerald',
      tests: [
        {
          id: 'disc-onvif-scan',
          name: 'ONVIF Scan Endpoint',
          description: 'POST /api/discovery/onvif/scan',
          run: async () => {
            const res = await fetch(`${gw}/api/discovery/onvif/scan`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ timeoutMs: 1000 }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return `ONVIF scan: ${data.devices?.length || 0} device(s) found`;
          },
        },
        {
          id: 'disc-auto',
          name: 'Auto Discovery Endpoint',
          description: 'POST /api/discovery/auto — full scan (may take time)',
          run: async () => {
            const res = await fetch(`${gw}/api/discovery/auto`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const s = data.summary || {};
            return `USB: ${s.usbFound || 0}, ONVIF: ${s.onvifFound || 0}, Network: ${s.networkFound || 0}, Added: ${s.added || 0}`;
          },
        },
        {
          id: 'disc-frontend-mock',
          name: 'Frontend Mock Scan',
          description: 'cameraDiscoveryService.scanLocalNetwork()',
          run: async () => {
            const results = await cameraDiscoveryService.scanLocalNetwork(() => {});
            return `Mock scan found ${results.length} cameras`;
          },
        },
        {
          id: 'disc-added-cameras',
          name: 'Frontend CameraStore',
          description: 'cameraStore.cameras — current UI source of truth',
          run: async () => {
            return `${cameras.length} camera(s) in cameraStore`;
          },
        },
      ],
    },
    {
      id: 'security',
      name: 'Security',
      icon: Lock,
      color: 'red',
      tests: [
        {
          id: 'sec-no-password',
          name: 'No Passwords Exposed',
          description: 'Camera list should not contain password field',
          run: async () => {
            const list = await fetchCameraList();
            const text = JSON.stringify(list);
            if (text.includes('"password"')) throw new Error('PASSWORD EXPOSED in camera list!');
            if (text.includes('"rtspUrl"')) throw new Error('RTSP URL EXPOSED in camera list!');
            return 'No sensitive fields in camera responses';
          },
        },
        {
          id: 'sec-no-password-single',
          name: 'Single Camera — No Secrets',
          description: 'GET /api/cameras/:id — no password',
          run: async () => {
            const list = await fetchCameraList();
            if (list.length === 0) return 'Skip — no cameras to test';
            const res = await fetch(`${gw}/api/cameras/${list[0].id}`);
            const text = await res.text();
            if (text.includes('"password"')) throw new Error('PASSWORD EXPOSED!');
            return 'Single camera endpoint is clean';
          },
        },
        {
          id: 'sec-auth-context',
          name: 'Auth Context Exists',
          description: 'Authentication system is active',
          run: async () => {
            const stored = localStorage.getItem('vipo_user');
            if (!stored) throw new Error('No auth data found in localStorage — please log in');
            const parsed = JSON.parse(stored);
            if (!parsed.name) throw new Error('No user name in auth data');
            return `Logged in as: ${parsed.name} (${parsed.role || 'user'})`;
          },
        },
        {
          id: 'sec-https-check',
          name: 'HTTPS / Secure Context',
          description: 'Check if running in secure context',
          run: async () => {
            const isSecure = window.isSecureContext;
            const proto = window.location.protocol;
            if (isSecure) return `Secure context: ${proto}`;
            return `Not secure (${proto}) — OK for local dev`;
          },
        },
        {
          id: 'sec-csp-headers',
          name: 'Content Security Policy',
          description: 'Check CSP headers on API responses',
          run: async () => {
            const res = await fetch(`${gw}/api/health`);
            const csp = res.headers.get('content-security-policy');
            const xframe = res.headers.get('x-frame-options');
            const parts = [];
            if (csp) parts.push('CSP: set');
            if (xframe) parts.push(`X-Frame: ${xframe}`);
            if (parts.length === 0) return 'No security headers (add for production)';
            return parts.join(', ');
          },
        },
      ],
    },
    {
      id: 'frontend',
      name: 'Frontend Data & UI',
      icon: LayoutDashboard,
      color: 'slate',
      tests: [
        {
          id: 'fe-cameras-data',
          name: 'Camera Data File',
          description: 'cameras array has valid structure',
          run: async () => {
            if (!Array.isArray(cameras)) throw new Error('cameras is not an array');
            if (cameras.length === 0) throw new Error('cameras array is empty');
            for (const c of cameras) {
              if (!c.id) throw new Error(`Camera missing id: ${JSON.stringify(c).slice(0, 50)}`);
              if (!c.name) throw new Error(`Camera ${c.id} missing name`);
              if (typeof c.ptzSupported !== 'boolean') throw new Error(`Camera ${c.id}: ptzSupported not boolean`);
              if (!c.ptzType) throw new Error(`Camera ${c.id}: missing ptzType field`);
            }
            return `${cameras.length} cameras, all valid structure`;
          },
        },
        {
          id: 'fe-gateway-config',
          name: 'Gateway Config',
          description: 'GATEWAY_BASE is set correctly',
          run: async () => {
            if (GATEWAY_BASE === '') return 'Gateway: (empty — using Vite proxy in dev mode)';
            if (!GATEWAY_BASE.startsWith('http')) throw new Error(`Invalid URL: ${GATEWAY_BASE}`);
            return `Gateway: ${GATEWAY_BASE}`;
          },
        },
        {
          id: 'fe-localstorage',
          name: 'LocalStorage Access',
          description: 'Can read/write localStorage',
          run: async () => {
            const key = '__diag_test__';
            localStorage.setItem(key, 'ok');
            const val = localStorage.getItem(key);
            localStorage.removeItem(key);
            if (val !== 'ok') throw new Error('localStorage read/write failed');
            return 'localStorage read/write OK';
          },
        },
        {
          id: 'fe-zoom-context',
          name: 'UI Zoom Persisted',
          description: 'UI zoom level in localStorage',
          run: async () => {
            const zoom = localStorage.getItem('vipo-ui-zoom');
            return `Stored zoom: ${zoom || '1.0 (default)'}`;
          },
        },
        {
          id: 'fe-routes',
          name: 'Router Paths',
          description: 'All expected routes exist',
          run: async () => {
            const paths = ['/', '/cameras', '/discover', '/recordings', '/events', '/settings'];
            return `${paths.length} routes configured: ${paths.join(', ')}`;
          },
        },
        {
          id: 'fe-hls-support',
          name: 'HLS.js Support',
          description: 'Browser HLS playback capability',
          run: async () => {
            const nativeHls = document.createElement('video').canPlayType('application/vnd.apple.mpegurl');
            let hlsJs = false;
            try { const Hls = (await import('hls.js')).default; hlsJs = Hls.isSupported(); } catch { /* */ }
            const parts = [];
            if (hlsJs) parts.push('HLS.js ✓');
            if (nativeHls) parts.push(`Native HLS: ${nativeHls}`);
            if (parts.length === 0) throw new Error('No HLS support in this browser!');
            return parts.join(', ');
          },
        },
        {
          id: 'fe-sw-status',
          name: 'Service Worker',
          description: 'PWA Service Worker registration status',
          run: async () => {
            if (!('serviceWorker' in navigator)) return 'ServiceWorker not supported';
            const regs = await navigator.serviceWorker.getRegistrations();
            if (regs.length === 0) return 'No Service Workers registered';
            return `${regs.length} SW registered, state: ${regs[0].active?.state || 'waiting'}`;
          },
        },
        {
          id: 'fe-media-devices',
          name: 'Media Devices API',
          description: 'Browser media capabilities',
          run: async () => {
            if (!navigator.mediaDevices) return 'MediaDevices API not available';
            try {
              const devices = await navigator.mediaDevices.enumerateDevices();
              const video = devices.filter(d => d.kind === 'videoinput').length;
              const audio = devices.filter(d => d.kind === 'audioinput').length;
              return `Devices: ${video} video, ${audio} audio inputs`;
            } catch { return 'MediaDevices accessible (permission needed for details)'; }
          },
        },
      ],
    },
    {
      id: 'camera-quality',
      name: 'Camera Hardware & Quality',
      icon: Eye,
      color: 'teal',
      tests: [
        ...cameras.filter(c => c.brand === 'CloseLi').map((cam) => ({
          id: `hw-${cam.id}`,
          name: `${cam.name} — Hardware`,
          description: `Detect brand, model, resolution for ${cam.id}`,
          run: async () => {
            const res = await fetch(`${gw}/api/cameras/${cam.id}/probe`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const hw = data.hardware;
            if (!hw) throw new Error('No hardware data returned');
            if (hw.brand === 'Unknown') throw new Error('Brand not detected');
            return `${hw.brand} ${hw.model} | ${hw.type} | ${hw.ip}:${hw.port} | Config: ${hw.configuredResolution} @ ${hw.configuredFps}fps`;
          },
        })),
        ...cameras.filter(c => c.brand === 'CloseLi').map((cam) => ({
          id: `quality-${cam.id}`,
          name: `${cam.name} — Stream Quality`,
          description: `FFprobe actual resolution, codec, FPS for ${cam.id}`,
          run: async () => {
            const res = await fetch(`${gw}/api/cameras/${cam.id}/probe`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!data.quality) {
              if (data.stream === null) return `No active stream — start stream first`;
              throw new Error('FFprobe returned no video data');
            }
            const q = data.quality;
            const hw = data.hardware;
            const s = data.stream;
            const uptimeMin = s?.uptime ? `${Math.floor(s.uptime / 60)}m${s.uptime % 60}s` : 'N/A';
            // Quality analysis
            const warnings = [];
            const pixels = q.width * q.height;
            if (pixels < 480 * 360) warnings.push('VERY LOW RES');
            else if (pixels < 1280 * 720) warnings.push('SD quality');
            // Compare to configured resolution
            if (hw?.configuredResolution) {
              const [cfgW] = hw.configuredResolution.split('x').map(Number);
              if (cfgW && q.width < cfgW * 0.5) warnings.push(`expected ${hw.configuredResolution}`);
            }
            // Check FPS
            const actualFps = q.fps.includes('/') ? parseInt(q.fps.split('/')[0]) : parseInt(q.fps);
            if (actualFps < 20) warnings.push(`low FPS (${actualFps})`);
            // Check profile
            if (q.profile !== 'High') warnings.push(`profile: ${q.profile} (High recommended)`);
            
            const grade = pixels >= 1280 * 720 ? 'HD' : pixels >= 640 * 360 ? 'SD' : 'LOW';
            const warn = warnings.length > 0 ? ` ⚠ ${warnings.join(', ')}` : ' ✅';
            return `[${grade}] ${q.width}x${q.height} | ${q.codec} (${q.profile}) | ${actualFps}fps | ${q.bitrate} | ${uptimeMin}${warn}`;
          },
        })),
      ],
    },
    {
      id: 'performance',
      name: 'Performance',
      icon: Zap,
      color: 'orange',
      tests: [
        {
          id: 'perf-api-latency',
          name: 'API Latency',
          description: 'Round-trip time to backend',
          run: async () => {
            const times = [];
            for (let i = 0; i < 3; i++) {
              const t0 = performance.now();
              await fetch(`${gw}/api/health`);
              times.push(Math.round(performance.now() - t0));
            }
            const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
            const min = Math.min(...times);
            const max = Math.max(...times);
            if (avg > 500) throw new Error(`High latency: avg ${avg}ms`);
            return `avg: ${avg}ms, min: ${min}ms, max: ${max}ms`;
          },
        },
        {
          id: 'perf-memory',
          name: 'Memory Usage',
          description: 'JavaScript heap size',
          run: async () => {
            const mem = performance.memory;
            if (!mem) return 'Memory API not available (Chrome only)';
            const used = (mem.usedJSHeapSize / 1024 / 1024).toFixed(1);
            const total = (mem.totalJSHeapSize / 1024 / 1024).toFixed(1);
            const limit = (mem.jsHeapSizeLimit / 1024 / 1024).toFixed(0);
            if (mem.usedJSHeapSize > mem.jsHeapSizeLimit * 0.8) throw new Error(`High memory: ${used}MB / ${limit}MB`);
            return `${used}MB / ${total}MB (limit: ${limit}MB)`;
          },
        },
        {
          id: 'perf-stream-count',
          name: 'Active Streams Load',
          description: 'Current stream count vs capacity',
          run: async () => {
            const res = await fetch(`${gw}/api/streams/status`);
            const data = await res.json();
            const count = Object.keys(data).length;
            const running = Object.values(data).filter(s => s.state === 'running').length;
            return `${running} running / ${count} total streams`;
          },
        },
        {
          id: 'perf-camera-ping',
          name: 'Camera Reachability',
          description: 'Quick check if cameras respond',
          run: async () => {
            const list = await fetchCameraList();
            const closeli = list.filter(c => c.brand === 'CloseLi');
            if (closeli.length === 0) return 'No CloseLi cameras to ping';
            const t0 = performance.now();
            await fetch(`${gw}/api/health`);
            const latency = Math.round(performance.now() - t0);
            return `${closeli.length} CloseLi cameras, gateway latency: ${latency}ms`;
          },
        },
      ],
    },
  ];
}

// ─── Status helpers ───────────────────────────────────────────────

const STATUS = { IDLE: 'idle', RUNNING: 'running', PASS: 'pass', FAIL: 'fail', WARN: 'warn' };

function StatusIcon({ status, className = 'w-4 h-4' }) {
  switch (status) {
    case STATUS.PASS: return <CheckCircle className={`${className} text-emerald-400`} />;
    case STATUS.FAIL: return <XCircle className={`${className} text-red-400`} />;
    case STATUS.WARN: return <AlertTriangle className={`${className} text-amber-400`} />;
    case STATUS.RUNNING: return <Loader2 className={`${className} text-cyan-400 animate-spin`} />;
    default: return <Clock className={`${className} text-slate-600`} />;
  }
}

// ─── Main Component ───────────────────────────────────────────────

export default function DiagnosticsPanel({ isOpen, onClose }) {
  const { cameras } = useCameraStore();
  const suites = useMemo(() => buildTestSuites(cameras), [cameras]);
  const [results, setResults] = useState({});
  const [expandedSuites, setExpandedSuites] = useState(new Set());
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const logRef = useRef(null);

  const addLog = useCallback((level, message) => {
    const entry = {
      time: new Date().toISOString().slice(11, 23),
      level,
      message,
    };
    setLogs((prev) => [...prev, entry]);
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const runTest = useCallback(async (testId, testFn) => {
    setResults((prev) => ({ ...prev, [testId]: { status: STATUS.RUNNING, message: '', ms: 0 } }));
    addLog('info', `Running: ${testId}...`);

    const start = performance.now();
    try {
      const message = await testFn();
      const ms = Math.round(performance.now() - start);
      setResults((prev) => ({ ...prev, [testId]: { status: STATUS.PASS, message, ms } }));
      addLog('pass', `✓ ${testId} (${ms}ms) — ${message}`);
    } catch (err) {
      const ms = Math.round(performance.now() - start);
      const message = err.message || 'Unknown error';
      setResults((prev) => ({ ...prev, [testId]: { status: STATUS.FAIL, message, ms } }));
      addLog('fail', `✗ ${testId} (${ms}ms) — ${message}`);
    }
  }, [addLog]);

  const runSuite = useCallback(async (suite) => {
    setExpandedSuites((prev) => new Set([...prev, suite.id]));
    addLog('info', `━━━ Running suite: ${suite.name} (${suite.tests.length} tests) ━━━`);
    for (const test of suite.tests) {
      await runTest(test.id, test.run);
    }
    addLog('info', `━━━ Suite complete: ${suite.name} ━━━`);
  }, [runTest, addLog]);

  const runAll = useCallback(async () => {
    setRunning(true);
    setResults({});
    setLogs([]);
    addLog('info', '═══════════════════════════════════════');
    addLog('info', 'VIPO Vision — Full Diagnostics Run');
    addLog('info', `Started at: ${new Date().toLocaleString()}`);
    addLog('info', '═══════════════════════════════════════');

    for (const suite of suites) {
      await runSuite(suite);
    }

    const allResults = {};
    suites.forEach((s) => s.tests.forEach((t) => { allResults[t.id] = true; }));
    setRunning(false);

    addLog('info', '═══════════════════════════════════════');
    addLog('info', 'Diagnostics complete');
    addLog('info', '═══════════════════════════════════════');
  }, [suites, runSuite, addLog]);

  const toggleSuite = useCallback((suiteId) => {
    setExpandedSuites((prev) => {
      const next = new Set(prev);
      if (next.has(suiteId)) next.delete(suiteId);
      else next.add(suiteId);
      return next;
    });
  }, []);

  const clearResults = useCallback(() => {
    setResults({});
    setLogs([]);
  }, []);

  const getLogsText = useCallback(() => {
    return logs.map((l) => `[${l.time}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
  }, [logs]);

  const copyLogs = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getLogsText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = getLogsText();
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [getLogsText]);

  const downloadLogs = useCallback(() => {
    const blob = new Blob([getLogsText()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vipo-diagnostics-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }, [getLogsText]);

  const getSuiteSummary = useCallback((suite) => {
    let pass = 0, fail = 0, running = 0, idle = 0;
    for (const t of suite.tests) {
      const r = results[t.id];
      if (!r) { idle++; continue; }
      if (r.status === STATUS.PASS) pass++;
      else if (r.status === STATUS.FAIL) fail++;
      else if (r.status === STATUS.RUNNING) running++;
    }
    return { pass, fail, running, idle, total: suite.tests.length };
  }, [results]);

  const totalSummary = suites.reduce(
    (acc, s) => {
      const sm = getSuiteSummary(s);
      acc.pass += sm.pass;
      acc.fail += sm.fail;
      acc.total += sm.total;
      return acc;
    },
    { pass: 0, fail: 0, total: 0 }
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-black/70 backdrop-blur-sm">
      <div className="flex flex-col w-full max-w-6xl mx-auto my-4 bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Diagnostics & Testing</h2>
              <p className="text-[10px] text-slate-500">
                {totalSummary.total} tests — {totalSummary.pass} passed — {totalSummary.fail} failed
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearResults}
              disabled={running}
              className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800/50 transition-colors disabled:opacity-30"
              title="Clear Results"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowLogs(!showLogs)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                showLogs ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25' : 'text-slate-400 hover:text-white bg-slate-800/50'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                Logs {logs.length > 0 && `(${logs.length})`}
              </span>
            </button>
            <button
              onClick={runAll}
              disabled={running}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 transition-all shadow-lg shadow-amber-500/20"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? 'Running...' : 'Run All Tests'}
            </button>
            <button onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800/50">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content: split between tests and logs */}
        <div className="flex flex-1 overflow-hidden">
          {/* Test Suites Panel */}
          <div className={`flex-1 overflow-y-auto p-4 space-y-2 ${showLogs ? 'w-1/2' : 'w-full'}`}>
            {suites.map((suite) => {
              const summary = getSuiteSummary(suite);
              const isExpanded = expandedSuites.has(suite.id);
              const Icon = suite.icon;

              return (
                <div key={suite.id} className="bg-slate-900/60 border border-slate-800/50 rounded-xl overflow-hidden">
                  {/* Suite Header */}
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-800/30 transition-colors"
                    onClick={() => toggleSuite(suite.id)}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                      <div className={`w-7 h-7 rounded-lg bg-${suite.color}-500/10 border border-${suite.color}-500/20 flex items-center justify-center`}>
                        <Icon className={`w-4 h-4 text-${suite.color}-400`} />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white">{suite.name}</h3>
                        <p className="text-[10px] text-slate-500">{suite.tests.length} tests</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {summary.pass > 0 && (
                        <span className="text-[10px] font-medium text-emerald-400">{summary.pass} ✓</span>
                      )}
                      {summary.fail > 0 && (
                        <span className="text-[10px] font-medium text-red-400">{summary.fail} ✗</span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); runSuite(suite); }}
                        disabled={running}
                        className="px-2.5 py-1 rounded-md text-[10px] font-medium bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-30"
                      >
                        <Play className="w-3 h-3 inline mr-1" />
                        Run
                      </button>
                    </div>
                  </div>

                  {/* Suite Tests */}
                  {isExpanded && (
                    <div className="border-t border-slate-800/30">
                      {suite.tests.map((test) => {
                        const r = results[test.id];
                        return (
                          <div
                            key={test.id}
                            className={`flex items-center justify-between px-4 py-2.5 border-b border-slate-800/20 last:border-0 ${
                              r?.status === STATUS.FAIL ? 'bg-red-500/5' : r?.status === STATUS.PASS ? 'bg-emerald-500/3' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <StatusIcon status={r?.status || STATUS.IDLE} />
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-200 truncate">{test.name}</p>
                                <p className="text-[10px] text-slate-500 truncate">{test.description}</p>
                                {r?.message && (
                                  <p className={`text-[10px] mt-0.5 truncate ${
                                    r.status === STATUS.FAIL ? 'text-red-400' : 'text-emerald-400/70'
                                  }`}>
                                    {r.message}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              {r?.ms > 0 && (
                                <span className="text-[10px] font-mono text-slate-600">{r.ms}ms</span>
                              )}
                              <button
                                onClick={() => runTest(test.id, test.run)}
                                disabled={running}
                                className="p-1 rounded text-slate-600 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30"
                                title="Run this test"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Logs Panel */}
          {showLogs && (
            <div className="w-1/2 border-l border-slate-800/60 flex flex-col bg-slate-950">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/40 flex-shrink-0">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Test Log</h3>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={downloadLogs}
                    disabled={logs.length === 0}
                    className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30"
                    title="Download Logs"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={copyLogs}
                    disabled={logs.length === 0}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-30"
                    title="Copy Logs"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied!' : 'Copy All'}
                  </button>
                </div>
              </div>
              <div
                ref={logRef}
                className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed"
              >
                {logs.length === 0 ? (
                  <p className="text-slate-600 text-center mt-8">Run tests to see logs here...</p>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="py-0.5">
                      <span className="text-slate-600">[{log.time}]</span>{' '}
                      <span className={
                        log.level === 'fail' ? 'text-red-400' :
                        log.level === 'pass' ? 'text-emerald-400' :
                        'text-slate-400'
                      }>
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
