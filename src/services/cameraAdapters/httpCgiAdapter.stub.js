/**
 * VIPO Vision — HTTP CGI Camera Adapter (Stub)
 *
 * This is a placeholder for HTTP CGI-based PTZ cameras.
 * Many IP cameras expose PTZ via simple HTTP GET/POST endpoints.
 *
 * Common CGI patterns by vendor:
 *
 * ── Hikvision ──
 *   PUT /ISAPI/PTZCtrl/channels/{id}/continuous
 *   Body: <PTZData><pan>50</pan><tilt>50</tilt></PTZData>
 *
 * ── Dahua ──
 *   GET /cgi-bin/ptz.cgi?action=start&channel=0&code=Left&arg1=0&arg2=5&arg3=0
 *   GET /cgi-bin/ptz.cgi?action=stop&channel=0&code=Left
 *
 * ── Generic / Foscam-style ──
 *   GET /cgi-bin/CGIProxy.fcgi?cmd=ptzMoveLeft&usr=admin&pwd=pass
 *   GET /cgi-bin/CGIProxy.fcgi?cmd=ptzStopRun&usr=admin&pwd=pass
 *   GET /cgi-bin/CGIProxy.fcgi?cmd=ptzGotoPresetPoint&name=preset1
 *
 * ── Axis ──
 *   GET /axis-cgi/com/ptz.cgi?move=left&speed=50
 *   GET /axis-cgi/com/ptz.cgi?move=stop
 *   GET /axis-cgi/com/ptz.cgi?gotoserverpresetname=Entrance
 *
 * Architecture note:
 *   Some cameras allow direct browser HTTP calls (if on same network + CORS).
 *   For cross-network, route through backend proxy:
 *     Frontend → /api/camera/{id}/ptz/move?dir=left&speed=5
 *     Backend  → GET http://{camera_ip}/cgi-bin/ptz.cgi?action=start&code=Left&arg2=5
 *
 * Required configuration per camera:
 *   - baseUrl: e.g. "http://192.168.1.100"
 *   - vendor: "hikvision" | "dahua" | "axis" | "generic"
 *   - auth: { username, password }
 *   - channel: 0 (default)
 */

import { fail, AdapterError } from './types';

// eslint-disable-next-line no-unused-vars
export function createHttpCgiAdapter(_cameraConfig = {}) {
  // TODO: Parse vendor type from cameraConfig to select correct URL patterns
  // TODO: Build base URL from camera IP + port
  // TODO: Setup Basic Auth or digest auth headers

  const TODO = (method) =>
    fail(AdapterError.NOT_SUPPORTED, `HTTP CGI ${method} — not yet implemented`);

  return {
    // ─── Connection ──────────────────────────────────
    // TODO: Send a test request (e.g. GET /cgi-bin/magicBox.cgi?action=getSystemInfo)
    // to verify camera is reachable and credentials work
    async connect() { return TODO('connect'); },

    // TODO: No persistent connection needed for CGI, just clear state
    async disconnect() { return TODO('disconnect'); },

    // TODO: Ping camera endpoint, measure RTT
    async getStatus() { return TODO('getStatus'); },

    // TODO: Query device capabilities endpoint if available
    getCapabilities() { return []; },

    // ─── PTZ Movement ────────────────────────────────
    // TODO: Map direction + speed to vendor-specific CGI call
    // Dahua: /cgi-bin/ptz.cgi?action=start&code={Up|Down|Left|Right}&arg2={speed}
    // Axis:  /axis-cgi/com/ptz.cgi?move={up|down|left|right}&speed={1-100}
    async ptzMove() { return TODO('ptzMove'); },

    // TODO: Send stop command
    // Dahua: /cgi-bin/ptz.cgi?action=stop&code={lastDirection}
    // Axis:  /axis-cgi/com/ptz.cgi?move=stop
    async ptzStop() { return TODO('ptzStop'); },

    // TODO: Go to home position
    // Dahua: /cgi-bin/ptz.cgi?action=start&code=GotoPreset&arg1=0
    // Axis:  /axis-cgi/com/ptz.cgi?move=home
    async ptzHome() { return TODO('ptzHome'); },

    // TODO: Query current position (not all CGI cameras support this)
    async ptzGetPosition() { return TODO('ptzGetPosition'); },

    // ─── Zoom ────────────────────────────────────────
    // TODO: /cgi-bin/ptz.cgi?action=start&code=ZoomTele (zoom in)
    // TODO: /cgi-bin/ptz.cgi?action=start&code=ZoomWide (zoom out)
    async zoomSet() { return TODO('zoomSet'); },
    async zoomIn() { return TODO('zoomIn'); },
    async zoomOut() { return TODO('zoomOut'); },

    // ─── Presets ─────────────────────────────────────
    async presetsList() { return TODO('presetsList'); },
    async presetGo() { return TODO('presetGo'); },
    async presetSave() { return TODO('presetSave'); },
    async presetDelete() { return TODO('presetDelete'); },
    async presetRename() { return TODO('presetRename'); },
  };
}
