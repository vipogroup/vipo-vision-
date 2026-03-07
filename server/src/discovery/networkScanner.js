/**
 * VIPO Vision — Network Scanner
 *
 * Scans the local subnet for IP cameras by probing common camera ports.
 * Tries to identify device type by checking HTTP responses.
 */

import net from 'net';
import os from 'os';
import http from 'http';
import { log } from '../sanitize.js';

const CAMERA_PORTS = [80, 554, 8080, 8899, 8000, 37777, 34567, 9000];
const CONNECT_TIMEOUT = 800;
const HTTP_TIMEOUT = 2000;

function getLocalSubnets() {
  const interfaces = os.networkInterfaces();
  const subnets = [];

  for (const [, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const parts = addr.address.split('.');
        subnets.push({
          base: `${parts[0]}.${parts[1]}.${parts[2]}`,
          localIp: addr.address,
        });
      }
    }
  }

  return subnets;
}

function tcpProbe(ip, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(CONNECT_TIMEOUT);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, ip);
  });
}

function httpProbe(ip, port, path = '/') {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: ip, port, path, timeout: HTTP_TIMEOUT },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk.toString();
          if (body.length > 2048) res.destroy();
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body.slice(0, 2048),
          });
        });
        res.on('error', () => resolve(null));
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function identifyCamera(ip, openPorts, httpInfo) {
  const info = {
    ip,
    ports: openPorts,
    type: 'Unknown',
    brand: 'Unknown',
    model: 'Unknown',
    name: `Camera (${ip})`,
    rtspUrl: '',
    httpUrl: '',
    onvifSupported: false,
    ptzSupported: false,
  };

  const body = (httpInfo?.body || '').toLowerCase();
  const server = (httpInfo?.headers?.server || '').toLowerCase();

  // Hikvision
  if (body.includes('hikvision') || body.includes('dvrdvs') || server.includes('hikvision')) {
    info.brand = 'Hikvision';
    info.type = 'RTSP';
    info.name = `Hikvision (${ip})`;
    if (openPorts.includes(554)) {
      info.rtspUrl = `rtsp://${ip}:554/Streaming/Channels/101`;
    }
    info.onvifSupported = true;
    info.ptzSupported = true;
  }
  // Dahua
  else if (body.includes('dahua') || body.includes('dh_') || server.includes('dahua')) {
    info.brand = 'Dahua';
    info.type = 'RTSP';
    info.name = `Dahua (${ip})`;
    if (openPorts.includes(554)) {
      info.rtspUrl = `rtsp://${ip}:554/cam/realmonitor?channel=1&subtype=0`;
    }
    info.onvifSupported = true;
    info.ptzSupported = true;
  }
  // CloseLi / Ingenic
  else if (body.includes('ingenic') || body.includes('closeli') || body.includes('xxxxs_')) {
    info.brand = 'CloseLi';
    info.type = 'HTTP';
    info.name = `CloseLi (${ip})`;
    info.model = 'Ingenic T23';
  }
  // Generic with RTSP
  else if (openPorts.includes(554)) {
    info.type = 'RTSP';
    info.name = `IP Camera (${ip})`;
    info.rtspUrl = `rtsp://${ip}:554/stream1`;
    info.onvifSupported = openPorts.includes(80);
  }
  // Generic HTTP camera
  else if (openPorts.includes(8080) || openPorts.includes(80)) {
    info.type = 'HTTP';
    info.name = `IP Camera (${ip})`;
  }

  return info;
}

async function probeCloseLiChannels(ip, port) {
  const channels = [];
  const knownPrefixes = ['xxxxS_'];

  // Try to find CloseLi channel pages
  const resp = await httpProbe(ip, port, '/');
  if (!resp) return channels;

  const body = resp.body || '';
  // Extract channel IDs from the page
  const matches = body.match(/xxxxS_[a-f0-9_]+/gi) || [];
  const uniqueIds = [...new Set(matches)];

  if (uniqueIds.length > 0) {
    for (const chId of uniqueIds) {
      channels.push({
        channel: chId,
        httpUrl: `http://${ip}:${port}/${chId}/rawdata/`,
      });
    }
  } else {
    // If we can't find channels from the page, try common pattern
    const testResp = await httpProbe(ip, port, '/get_status.cgi');
    if (testResp && testResp.body) {
      const m = testResp.body.match(/xxxxS_[a-f0-9]+/gi);
      if (m) {
        const base = m[0];
        channels.push({ channel: base, httpUrl: `http://${ip}:${port}/${base}/rawdata/` });
        for (let i = 1; i <= 3; i++) {
          channels.push({ channel: `${base}_${i}`, httpUrl: `http://${ip}:${port}/${base}_${i}/rawdata/` });
        }
      }
    }
  }

  return channels;
}

export async function scanNetwork({ onProgress } = {}) {
  const subnets = getLocalSubnets();
  if (subnets.length === 0) {
    log('warn', 'No local subnets found for scanning');
    return [];
  }

  log('info', `Starting network scan on ${subnets.length} subnet(s): ${subnets.map((s) => s.base + '.x').join(', ')}`);

  const found = [];
  const totalHosts = subnets.length * 254;
  let scanned = 0;

  for (const subnet of subnets) {
    // Scan in batches to avoid overwhelming the network
    const BATCH_SIZE = 30;

    for (let batchStart = 1; batchStart <= 254; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, 254);
      const promises = [];

      for (let i = batchStart; i <= batchEnd; i++) {
        const ip = `${subnet.base}.${i}`;
        if (ip === subnet.localIp) { scanned++; continue; }

        promises.push(
          (async () => {
            // Quick TCP probe on key ports
            const portResults = await Promise.all(
              CAMERA_PORTS.map(async (port) => ({
                port,
                open: await tcpProbe(ip, port),
              }))
            );

            const openPorts = portResults.filter((r) => r.open).map((r) => r.port);

            if (openPorts.length > 0) {
              // Try HTTP probe for identification
              const httpPort = openPorts.includes(80) ? 80 : openPorts.includes(8080) ? 8080 : openPorts[0];
              const httpInfo = await httpProbe(ip, httpPort);
              const camera = identifyCamera(ip, openPorts, httpInfo);
              found.push(camera);
              log('info', `Found device at ${ip} — ports: ${openPorts.join(',')} — ${camera.brand}`);
            }

            scanned++;
          })()
        );
      }

      await Promise.all(promises);

      if (onProgress) {
        onProgress({
          scanned,
          total: totalHosts,
          progress: Math.round((scanned / totalHosts) * 100),
          found: found.length,
        });
      }
    }
  }

  log('info', `Network scan complete: ${found.length} device(s) found out of ${scanned} hosts scanned`);
  return found;
}

export { probeCloseLiChannels, getLocalSubnets };
