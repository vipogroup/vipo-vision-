/**
 * VIPO Vision — ONVIF Camera Adapter (Stub)
 *
 * This is a placeholder for the real ONVIF PTZ adapter.
 * Real implementation will require:
 *
 * 1. ONVIF device discovery via WS-Discovery (UDP multicast 239.255.255.250:3702)
 * 2. SOAP-based communication using ONVIF WSDL schemas:
 *    - Device Management: http://{ip}/onvif/device_service
 *    - PTZ Service: http://{ip}/onvif/ptz_service
 *    - Media Service: http://{ip}/onvif/media_service
 * 3. WS-Security UsernameToken authentication (digest)
 * 4. Profile token resolution from Media.GetProfiles()
 * 5. PTZ node and configuration via PTZ.GetNodes() / PTZ.GetConfigurations()
 *
 * Required npm packages for real implementation:
 *   - onvif (node-onvif) — for Node.js backend proxy
 *   - OR a custom SOAP client via fetch for browser-side (limited by CORS)
 *
 * Architecture note:
 *   Browser cannot directly call ONVIF SOAP endpoints due to CORS.
 *   The recommended pattern is:
 *     Frontend → REST API → Backend ONVIF Client → Camera
 *   This adapter will call our backend REST endpoints that proxy ONVIF commands.
 *
 * ONVIF PTZ operations:
 *   - ContinuousMove(ProfileToken, Velocity) — for continuous PTZ
 *   - RelativeMove(ProfileToken, Translation) — for step moves
 *   - AbsoluteMove(ProfileToken, Position) — for preset go-to
 *   - Stop(ProfileToken) — halt movement
 *   - GetPresets(ProfileToken) — list presets
 *   - SetPreset(ProfileToken, PresetName) — save preset
 *   - RemovePreset(ProfileToken, PresetToken) — delete preset
 *   - GotoPreset(ProfileToken, PresetToken) — go to preset
 *   - GotoHomePosition(ProfileToken) — return to home
 *   - SetHomePosition(ProfileToken) — set home position
 */

import { fail, AdapterError } from './types';

const TODO = (Method) =>
  fail(AdapterError.NOT_SUPPORTED, `ONVIF ${Method} — not yet implemented`);

export function createOnvifAdapter(_CameraConfig = {}) {
  // TODO: Store ONVIF profile token, service URLs, auth credentials
  // const profileToken = null;
  // const ptzServiceUrl = null;
  void _CameraConfig;

  return {
    // ─── Connection ──────────────────────────────────
    // TODO: Call backend /api/onvif/connect with camera IP, port, credentials
    // TODO: Discover services, get profiles, resolve PTZ node
    async connect(_Config) {
      void _Config;
      return TODO('connect');
    },

    // TODO: Clean up any subscriptions, release profile
    async disconnect() { return TODO('disconnect'); },

    // TODO: Call backend /api/onvif/status — returns connection + position
    async getStatus() { return TODO('getStatus'); },

    // TODO: Query PTZ node capabilities from GetNodes response
    getCapabilities() { return []; },

    // ─── PTZ Movement ────────────────────────────────
    // TODO: POST /api/onvif/ptz/continuous-move
    // Body: { profileToken, velocity: { panTilt: { x, y }, zoom: { x } } }
    // Map direction + speed to ONVIF velocity space (-1.0 to 1.0)
    async ptzMove(_Direction, _Speed) {
      void _Direction;
      void _Speed;
      return TODO('ptzMove');
    },

    // TODO: POST /api/onvif/ptz/stop
    // Body: { profileToken, panTilt: true, zoom: true }
    async ptzStop() { return TODO('ptzStop'); },

    // TODO: POST /api/onvif/ptz/goto-home
    // Body: { profileToken }
    async ptzHome() { return TODO('ptzHome'); },

    // TODO: GET /api/onvif/ptz/position?profileToken=...
    // Parse PTZStatus → Position → PanTilt + Zoom
    async ptzGetPosition() { return TODO('ptzGetPosition'); },

    // ─── Zoom ────────────────────────────────────────
    // TODO: Use AbsoluteMove with only zoom component
    async zoomSet(_Level) {
      void _Level;
      return TODO('zoomSet');
    },

    // TODO: ContinuousMove with positive zoom velocity, then stop after delay
    async zoomIn(_Step) {
      void _Step;
      return TODO('zoomIn');
    },

    // TODO: ContinuousMove with negative zoom velocity, then stop after delay
    async zoomOut(_Step) {
      void _Step;
      return TODO('zoomOut');
    },

    // ─── Presets ─────────────────────────────────────
    // TODO: GET /api/onvif/ptz/presets?profileToken=...
    // Map ONVIF preset tokens to our preset shape { id, name, pan, tilt, zoom }
    async presetsList() { return TODO('presetsList'); },

    // TODO: POST /api/onvif/ptz/goto-preset
    // Body: { profileToken, presetToken }
    async presetGo(_Id) {
      void _Id;
      return TODO('presetGo');
    },

    // TODO: POST /api/onvif/ptz/set-preset
    // Body: { profileToken, presetName }
    async presetSave(_Name) {
      void _Name;
      return TODO('presetSave');
    },

    // TODO: POST /api/onvif/ptz/remove-preset
    // Body: { profileToken, presetToken }
    async presetDelete(_Id) {
      void _Id;
      return TODO('presetDelete');
    },

    // TODO: ONVIF doesn't have native rename — delete + save at same position
    async presetRename(_Id, _Name) {
      void _Id;
      void _Name;
      return TODO('presetRename');
    },
  };
}
