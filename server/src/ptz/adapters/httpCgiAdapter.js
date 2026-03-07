/**
 * VIPO Vision — HTTP CGI PTZ Adapter
 *
 * Controls PTZ via vendor-specific HTTP CGI endpoints.
 * Ships with built-in templates for Hikvision and Dahua patterns.
 * Camera config specifies which template to use.
 */

import { log } from '../../sanitize.js';

// ─── Built-in CGI templates ─────────────────────────────────────────

const TEMPLATES = {
  hi3510: {
    name: 'Hi3510 (PTZ CGI)',
    move(baseUrl, direction, speed) {
      const act = { up: 'up', down: 'down', left: 'left', right: 'right' }[direction] || 'stop';
      const spd = Math.max(1, Math.min(10, Math.round(speed || 5)));
      return {
        url: `${baseUrl}/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=${act}&-speed=${spd}`,
        method: 'GET',
      };
    },
    stop(baseUrl) {
      return {
        url: `${baseUrl}/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=stop`,
        method: 'GET',
      };
    },
    zoom(baseUrl, mode) {
      const act = mode === 'in' ? 'zoomin' : mode === 'out' ? 'zoomout' : 'stop';
      return {
        url: `${baseUrl}/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=${act}`,
        method: 'GET',
      };
    },
    presets() {
      return null;
    },
    gotoPreset(baseUrl, presetId) {
      const id = presetId || '0';
      return {
        url: `${baseUrl}/cgi-bin/hi3510/preset.cgi?-act=goto&-number=${encodeURIComponent(id)}`,
        method: 'GET',
      };
    },
    savePreset(baseUrl, name, presetId) {
      const id = presetId || '0';
      return {
        url: `${baseUrl}/cgi-bin/hi3510/preset.cgi?-act=set&-number=${encodeURIComponent(id)}`,
        method: 'GET',
      };
    },
  },

  hikvision: {
    name: 'Hikvision (ISAPI)',
    move(baseUrl, direction, speed) {
      const channelId = 1;
      const map = {
        up:    `${baseUrl}/ISAPI/PTZCtrl/channels/${channelId}/continuous`,
        down:  `${baseUrl}/ISAPI/PTZCtrl/channels/${channelId}/continuous`,
        left:  `${baseUrl}/ISAPI/PTZCtrl/channels/${channelId}/continuous`,
        right: `${baseUrl}/ISAPI/PTZCtrl/channels/${channelId}/continuous`,
      };
      const panSpeed = Math.round(speed * 10);
      const tiltSpeed = Math.round(speed * 10);
      const vectors = {
        up:    { pan: 0, tilt: tiltSpeed },
        down:  { pan: 0, tilt: -tiltSpeed },
        left:  { pan: -panSpeed, tilt: 0 },
        right: { pan: panSpeed, tilt: 0 },
      };
      const v = vectors[direction] || { pan: 0, tilt: 0 };
      return {
        url: map[direction] || map.up,
        method: 'PUT',
        headers: { 'Content-Type': 'application/xml' },
        body: `<PTZData><pan>${v.pan}</pan><tilt>${v.tilt}</tilt><zoom>0</zoom></PTZData>`,
      };
    },
    stop(baseUrl) {
      return {
        url: `${baseUrl}/ISAPI/PTZCtrl/channels/1/continuous`,
        method: 'PUT',
        headers: { 'Content-Type': 'application/xml' },
        body: '<PTZData><pan>0</pan><tilt>0</tilt><zoom>0</zoom></PTZData>',
      };
    },
    zoom(baseUrl, mode) {
      const zoomVal = mode === 'in' ? 30 : mode === 'out' ? -30 : 0;
      return {
        url: `${baseUrl}/ISAPI/PTZCtrl/channels/1/continuous`,
        method: 'PUT',
        headers: { 'Content-Type': 'application/xml' },
        body: `<PTZData><pan>0</pan><tilt>0</tilt><zoom>${zoomVal}</zoom></PTZData>`,
      };
    },
    presets(baseUrl) {
      return { url: `${baseUrl}/ISAPI/PTZCtrl/channels/1/presets`, method: 'GET' };
    },
    gotoPreset(baseUrl, presetId) {
      return { url: `${baseUrl}/ISAPI/PTZCtrl/channels/1/presets/${presetId}/goto`, method: 'PUT' };
    },
    savePreset(baseUrl, name, presetId) {
      return {
        url: `${baseUrl}/ISAPI/PTZCtrl/channels/1/presets/${presetId || 'new'}`,
        method: 'PUT',
        headers: { 'Content-Type': 'application/xml' },
        body: `<PTZPreset><presetName>${name}</presetName></PTZPreset>`,
      };
    },
  },

  dahua: {
    name: 'Dahua (CGI)',
    move(baseUrl, direction, speed) {
      const code = { up: 'Up', down: 'Down', left: 'Left', right: 'Right' }[direction] || 'Up';
      const spd = Math.round(speed * 8);
      return {
        url: `${baseUrl}/cgi-bin/ptz.cgi?action=start&channel=0&code=${code}&arg1=0&arg2=${spd}&arg3=0`,
        method: 'GET',
      };
    },
    stop(baseUrl) {
      return {
        url: `${baseUrl}/cgi-bin/ptz.cgi?action=stop&channel=0&code=Up&arg1=0&arg2=0&arg3=0`,
        method: 'GET',
      };
    },
    zoom(baseUrl, mode) {
      const code = mode === 'in' ? 'ZoomTele' : 'ZoomWide';
      return {
        url: `${baseUrl}/cgi-bin/ptz.cgi?action=start&channel=0&code=${code}&arg1=0&arg2=0&arg3=0`,
        method: 'GET',
      };
    },
    presets(baseUrl) {
      return { url: `${baseUrl}/cgi-bin/ptz.cgi?action=getPresets&channel=0`, method: 'GET' };
    },
    gotoPreset(baseUrl, presetId) {
      return {
        url: `${baseUrl}/cgi-bin/ptz.cgi?action=start&channel=0&code=GotoPreset&arg1=0&arg2=${presetId}&arg3=0`,
        method: 'GET',
      };
    },
    savePreset(baseUrl, name, presetId) {
      const id = presetId || Date.now();
      return {
        url: `${baseUrl}/cgi-bin/ptz.cgi?action=start&channel=0&code=SetPreset&arg1=0&arg2=${id}&arg3=0`,
        method: 'GET',
      };
    },
  },
};

// ─── Helper ─────────────────────────────────────────────────────────

async function doRequest(spec, auth) {
  const opts = {
    method: spec.method || 'GET',
    headers: { ...spec.headers },
  };

  if (auth && auth.username) {
    const b64 = Buffer.from(`${auth.username}:${auth.password || ''}`).toString('base64');
    opts.headers['Authorization'] = `Basic ${b64}`;
  }

  if (spec.body) {
    opts.body = spec.body;
  }

  const res = await fetch(spec.url, opts);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${spec.url}`);
  }
  const text = await res.text();
  return text;
}

function getTemplate(camera) {
  const tplName = camera.httpCgi?.templateName;
  if (!tplName || !TEMPLATES[tplName]) return null;
  return TEMPLATES[tplName];
}

function getBaseUrl(camera) {
  if (camera.httpCgi?.baseUrl) return camera.httpCgi.baseUrl;
  return `http://${camera.ip}:${camera.port || 80}`;
}

function getAuth(camera) {
  return { username: camera.username || '', password: camera.password || '' };
}

// ─── Adapter ────────────────────────────────────────────────────────

export const httpCgiAdapter = {
  async move(camera, direction, speed = 0.5) {
    const tpl = getTemplate(camera);
    if (!tpl) throw new Error(`No HTTP CGI template for camera ${camera.id}`);
    const spec = tpl.move(getBaseUrl(camera), direction, speed);
    await doRequest(spec, getAuth(camera));
    log('info', `[${camera.id}] HTTP-CGI move ${direction} (${tpl.name})`);
  },

  async stop(camera) {
    const tpl = getTemplate(camera);
    if (!tpl) throw new Error(`No HTTP CGI template for camera ${camera.id}`);
    const spec = tpl.stop(getBaseUrl(camera));
    await doRequest(spec, getAuth(camera));
    log('info', `[${camera.id}] HTTP-CGI stop`);
  },

  async zoom(camera, mode) {
    const tpl = getTemplate(camera);
    if (!tpl) throw new Error(`No HTTP CGI template for camera ${camera.id}`);
    const spec = tpl.zoom(getBaseUrl(camera), mode);
    await doRequest(spec, getAuth(camera));
    log('info', `[${camera.id}] HTTP-CGI zoom ${mode}`);
  },

  async getPresets(camera) {
    const tpl = getTemplate(camera);
    if (!tpl) return [];
    try {
      const spec = tpl.presets(getBaseUrl(camera));
      if (!spec) return [];
      await doRequest(spec, getAuth(camera));
      // Parsing vendor-specific preset XML is complex — return empty for now
      // Real implementation would parse the response per vendor
      return [];
    } catch {
      return [];
    }
  },

  async gotoPreset(camera, presetId) {
    const tpl = getTemplate(camera);
    if (!tpl) throw new Error(`No HTTP CGI template for camera ${camera.id}`);
    const spec = tpl.gotoPreset(getBaseUrl(camera), presetId);
    await doRequest(spec, getAuth(camera));
    log('info', `[${camera.id}] HTTP-CGI goto preset ${presetId}`);
  },

  async savePreset(camera, name) {
    const tpl = getTemplate(camera);
    if (!tpl) throw new Error(`No HTTP CGI template for camera ${camera.id}`);
    const presetId = String(Date.now()).slice(-4);
    const spec = tpl.savePreset(getBaseUrl(camera), name, presetId);
    await doRequest(spec, getAuth(camera));
    log('info', `[${camera.id}] HTTP-CGI saved preset "${name}"`);
    return { id: presetId, name };
  },

  async deletePreset() {
    log('warn', 'HTTP-CGI deletePreset not universally supported');
    throw new Error('deletePreset not supported via HTTP CGI');
  },

  getAvailableTemplates() {
    return Object.entries(TEMPLATES).map(([key, tpl]) => ({
      id: key,
      name: tpl.name,
    }));
  },
};
