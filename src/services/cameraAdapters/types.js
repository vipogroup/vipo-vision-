/**
 * VIPO Vision — Camera Adapter Interface Contracts
 *
 * Every camera adapter (ONVIF, HTTP CGI, Mock, Vendor API, etc.)
 * must implement these method signatures to be compatible with
 * the ptzService delegation layer.
 */

// ─── Enums ───────────────────────────────────────────────

export const Direction = Object.freeze({
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right',
  UP_LEFT: 'up_left',
  UP_RIGHT: 'up_right',
  DOWN_LEFT: 'down_left',
  DOWN_RIGHT: 'down_right',
});

export const AdapterType = Object.freeze({
  MOCK: 'mock',
  ONVIF: 'onvif',
  HTTP_CGI: 'http_cgi',
  VENDOR: 'vendor',
  USB: 'usb',
});

export const ConnectionStatus = Object.freeze({
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  ERROR: 'error',
  TIMEOUT: 'timeout',
});

export const AdapterError = Object.freeze({
  CONNECTION_FAILED: 'connection_failed',
  AUTH_FAILED: 'auth_failed',
  TIMEOUT: 'timeout',
  NOT_SUPPORTED: 'not_supported',
  OUT_OF_RANGE: 'out_of_range',
  BUSY: 'busy',
  UNKNOWN: 'unknown',
});

export const Capability = Object.freeze({
  PTZ_MOVE: 'ptz_move',
  PTZ_CONTINUOUS: 'ptz_continuous',
  PTZ_ABSOLUTE: 'ptz_absolute',
  PTZ_RELATIVE: 'ptz_relative',
  ZOOM_OPTICAL: 'zoom_optical',
  ZOOM_DIGITAL: 'zoom_digital',
  PRESETS: 'presets',
  HOME_POSITION: 'home_position',
  AUTO_TRACKING: 'auto_tracking',
  PATROL: 'patrol',
  IR_CUT: 'ir_cut',
  WIPER: 'wiper',
});

// ─── Adapter Interface Shape ─────────────────────────────
//
// Each adapter MUST export an object implementing these methods.
// All methods are async and return a standardized result shape.
//
// Result shape: { success: boolean, data?: any, error?: AdapterError, message?: string }

/**
 * @typedef {Object} AdapterResult
 * @property {boolean} success
 * @property {*} [data]
 * @property {string} [error] - One of AdapterError values
 * @property {string} [message]
 */

/**
 * @typedef {Object} PTZPosition
 * @property {number} pan   - Degrees, negative = left
 * @property {number} tilt  - Degrees, negative = down
 * @property {number} zoom  - Multiplier, 1.0 = no zoom
 */

/**
 * @typedef {Object} CameraAdapter
 *
 * --- Connection ---
 * @property {(config: Object) => Promise<AdapterResult>} connect
 * @property {() => Promise<AdapterResult>} disconnect
 * @property {() => Promise<{status: string, rttMs: number}>} getStatus
 * @property {() => Capability[]} getCapabilities
 *
 * --- PTZ Movement ---
 * @property {(direction: string, speed: number) => Promise<AdapterResult>} ptzMove
 * @property {() => Promise<AdapterResult>} ptzStop
 * @property {() => Promise<AdapterResult>} ptzHome
 * @property {() => Promise<PTZPosition>} ptzGetPosition
 *
 * --- Zoom ---
 * @property {(level: number) => Promise<AdapterResult>} zoomSet
 * @property {(step?: number) => Promise<AdapterResult>} zoomIn
 * @property {(step?: number) => Promise<AdapterResult>} zoomOut
 *
 * --- Presets ---
 * @property {() => Promise<Array>} presetsList
 * @property {(id: string) => Promise<AdapterResult>} presetGo
 * @property {(name: string) => Promise<AdapterResult>} presetSave
 * @property {(id: string) => Promise<AdapterResult>} presetDelete
 * @property {(id: string, name: string) => Promise<AdapterResult>} presetRename
 */

/**
 * Creates a standardized success result.
 */
export function ok(data = null, message = '') {
  return { success: true, data, message };
}

/**
 * Creates a standardized error result.
 */
export function fail(error = AdapterError.UNKNOWN, message = '') {
  return { success: false, error, message };
}
