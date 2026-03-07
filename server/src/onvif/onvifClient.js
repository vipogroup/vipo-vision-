/**
 * VIPO Vision — ONVIF Client
 *
 * Wraps the 'onvif' npm package to provide a clean async interface
 * for profiles, stream URIs, and PTZ operations.
 * Falls back to raw SOAP if the package has issues.
 */

import { Cam } from 'onvif';
import { log, sanitizeUrl } from '../sanitize.js';

function camConnect(opts) {
  return new Promise((resolve, reject) => {
    const cam = new Cam({
      hostname: opts.hostname,
      port: opts.port || 80,
      username: opts.username,
      password: opts.password,
      timeout: opts.timeout || 10000,
    }, (err) => {
      if (err) reject(err);
      else resolve(cam);
    });
  });
}

export async function createOnvifClient({ xaddr, username, password }) {
  let hostname, port;
  try {
    const u = new URL(xaddr);
    hostname = u.hostname;
    port = parseInt(u.port, 10) || 80;
  } catch {
    hostname = xaddr;
    port = 80;
  }

  log('info', `Connecting ONVIF client to ${hostname}:${port}`);

  const cam = await camConnect({ hostname, port, username, password });

  return {
    cam,
    hostname,
    port,

    async getProfiles() {
      return new Promise((resolve, reject) => {
        cam.getProfiles((err, profiles) => {
          if (err) return reject(err);
          const result = (profiles || []).map((p) => ({
            token: p.$.token || p.token,
            name: p.name || p.$.token,
            videoEncoding: p.videoEncoderConfiguration?.encoding || 'unknown',
            resolution: p.videoEncoderConfiguration?.resolution
              ? `${p.videoEncoderConfiguration.resolution.width}x${p.videoEncoderConfiguration.resolution.height}`
              : 'unknown',
            ptzSupported: !!(p.PTZConfiguration || p.ptzConfiguration),
          }));
          resolve(result);
        });
      });
    },

    async getStreamUri(profileToken) {
      return new Promise((resolve, reject) => {
        cam.getStreamUri({
          protocol: 'RTSP',
          profileToken,
        }, (err, stream) => {
          if (err) return reject(err);
          const uri = stream?.uri || stream?.Uri || '';
          log('info', `Got stream URI: ${sanitizeUrl(uri)}`);
          resolve(uri);
        });
      });
    },

    async continuousMove({ profileToken, x = 0, y = 0, zoom = 0, speed }) {
      return new Promise((resolve, reject) => {
        const velocity = { x, y, zoom };
        cam.continuousMove({
          profileToken,
          velocity,
          speed: speed ? { x: speed, y: speed } : undefined,
        }, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    },

    async stop({ profileToken, panTilt = true, zoom = true }) {
      return new Promise((resolve, reject) => {
        cam.stop({
          profileToken,
          panTilt,
          zoom,
        }, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    },

    async getPresets({ profileToken }) {
      return new Promise((resolve, reject) => {
        cam.getPresets({ profileToken }, (err, presets) => {
          if (err) return reject(err);
          const result = Object.entries(presets || {}).map(([token, name]) => ({
            token,
            name: typeof name === 'string' ? name : `Preset ${token}`,
          }));
          resolve(result);
        });
      });
    },

    async gotoPreset({ profileToken, presetToken, speed }) {
      return new Promise((resolve, reject) => {
        cam.gotoPreset({
          profileToken,
          preset: presetToken,
          speed: speed ? { x: speed, y: speed, zoom: speed } : undefined,
        }, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    },

    async setPreset({ profileToken, name }) {
      return new Promise((resolve, reject) => {
        cam.setPreset({
          profileToken,
          presetName: name,
        }, (err, result) => {
          if (err) return reject(err);
          resolve({ token: result?.presetToken || result });
        });
      });
    },

    async removePreset({ profileToken, presetToken }) {
      return new Promise((resolve, reject) => {
        if (typeof cam.removePreset === 'function') {
          cam.removePreset({ profileToken, presetToken }, (err) => {
            if (err) return reject(err);
            resolve();
          });
        } else {
          reject(new Error('removePreset not supported by this ONVIF implementation'));
        }
      });
    },
  };
}
