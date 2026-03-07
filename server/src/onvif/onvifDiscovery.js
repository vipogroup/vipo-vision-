/**
 * VIPO Vision — ONVIF WS-Discovery
 *
 * Sends a WS-Discovery Probe multicast to find ONVIF devices on the LAN.
 * Uses raw UDP + SOAP XML (no dependency on onvif package for discovery).
 */

import dgram from 'dgram';
import { parseStringPromise } from 'xml2js';
import { log } from '../sanitize.js';

const WS_DISCOVERY_ADDR = '239.255.255.250';
const WS_DISCOVERY_PORT = 3702;

function buildProbeXml(messageId) {
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <s:Header>
    <a:Action s:mustUnderstand="1">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</a:Action>
    <a:MessageID>uuid:${messageId}</a:MessageID>
    <a:ReplyTo><a:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address></a:ReplyTo>
    <a:To s:mustUnderstand="1">urn:schemas-xmlsoap-org:ws:2005:04:discovery</a:To>
  </s:Header>
  <s:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </s:Body>
</s:Envelope>`;
}

function generateUuid() {
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${hex()}-${hex()}${hex()}${hex()}`;
}

function extractText(obj) {
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return extractText(obj[0]);
  if (typeof obj === 'object' && obj._) return obj._;
  if (typeof obj === 'object') return JSON.stringify(obj);
  return String(obj || '');
}

async function parseProbeMatch(xml) {
  try {
    const result = await parseStringPromise(xml, {
      explicitNamespaces: false,
      tagNameProcessors: [(name) => name.replace(/^.*:/, '')],
      ignoreAttrs: true,
    });

    const env = result.Envelope || result.envelope;
    if (!env) return null;

    const body = env.Body?.[0] || env.body?.[0];
    if (!body) return null;

    const probeMatches = body.ProbeMatches?.[0] || body.probeMatches?.[0];
    if (!probeMatches) return null;

    const matches = probeMatches.ProbeMatch || probeMatches.probeMatch || [];
    const devices = [];

    for (const match of matches) {
      const xaddrs = extractText(match.XAddrs?.[0] || match.xAddrs?.[0] || '');
      const scopes = extractText(match.Scopes?.[0] || match.scopes?.[0] || '');

      if (!xaddrs) continue;

      const xaddr = xaddrs.split(/\s+/)[0];
      let ip = '';
      try {
        const u = new URL(xaddr);
        ip = u.hostname;
      } catch { /* ignore */ }

      let manufacturer = '';
      let model = '';
      let name = '';

      if (scopes) {
        const scopeList = scopes.split(/\s+/);
        for (const s of scopeList) {
          if (s.includes('/name/')) name = decodeURIComponent(s.split('/name/')[1] || '');
          if (s.includes('/hardware/')) model = decodeURIComponent(s.split('/hardware/')[1] || '');
          if (s.includes('/mfr/') || s.includes('/manufacturer/')) {
            manufacturer = decodeURIComponent(
              (s.split('/mfr/')[1] || s.split('/manufacturer/')[1] || '')
            );
          }
        }
      }

      devices.push({
        ip,
        xaddr,
        manufacturer: manufacturer || 'Unknown',
        model: model || 'Unknown',
        name: name || `ONVIF Camera (${ip})`,
        onvif: true,
      });
    }

    return devices;
  } catch (err) {
    log('warn', `Failed to parse WS-Discovery response: ${err.message}`);
    return null;
  }
}

export async function discoverOnvifDevices({ timeoutMs = 3000 } = {}) {
  return new Promise((resolve) => {
    const devices = new Map();
    const messageId = generateUuid();
    const probeXml = buildProbeXml(messageId);
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    const timer = setTimeout(() => {
      socket.close();
      const result = Array.from(devices.values());
      log('info', `ONVIF discovery complete: ${result.length} device(s) found`);
      resolve(result);
    }, timeoutMs);

    socket.on('error', (err) => {
      log('error', `WS-Discovery socket error: ${err.message}`);
      clearTimeout(timer);
      socket.close();
      resolve([]);
    });

    socket.on('message', async (msg) => {
      const xml = msg.toString('utf-8');
      const parsed = await parseProbeMatch(xml);
      if (parsed) {
        for (const dev of parsed) {
          if (dev.ip && !devices.has(dev.ip)) {
            devices.set(dev.ip, dev);
            log('info', `Discovered ONVIF device: ${dev.ip} (${dev.manufacturer} ${dev.model})`);
          }
        }
      }
    });

    socket.bind(() => {
      try {
        socket.addMembership(WS_DISCOVERY_ADDR);
      } catch { /* may fail on some interfaces */ }

      const buf = Buffer.from(probeXml, 'utf-8');
      socket.send(buf, 0, buf.length, WS_DISCOVERY_PORT, WS_DISCOVERY_ADDR, (err) => {
        if (err) {
          log('error', `WS-Discovery send error: ${err.message}`);
        } else {
          log('info', `WS-Discovery probe sent (timeout ${timeoutMs}ms)`);
        }
      });
    });
  });
}
