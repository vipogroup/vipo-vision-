/**
 * Analyze the custom protocol from port 12345 to identify per-channel markers.
 * Captures raw data, parses 16-byte headers before each NAL unit,
 * and maps header fields to H264 stream properties (resolution, NAL type).
 */

import net from 'net';

const CAMERA_IP = process.argv[2] || '10.0.0.9';
const PORT = parseInt(process.argv[3]) || 12345;

const NAL_TYPES = { 1: 'P-slice', 5: 'IDR', 6: 'SEI', 7: 'SPS', 8: 'PPS', 9: 'AUD' };

const socket = new net.Socket();
let allData = Buffer.alloc(0);
let totalBytes = 0;

socket.setTimeout(20000);

socket.on('data', (data) => {
  allData = Buffer.concat([allData, data]);
  totalBytes += data.length;
  if (totalBytes > 2 * 1024 * 1024) {
    socket.destroy();
  }
});

socket.on('close', analyze);
socket.on('timeout', () => { socket.destroy(); });
socket.on('error', (err) => { console.error('Error:', err.message); process.exit(1); });

console.log(`Capturing ~2MB from ${CAMERA_IP}:${PORT}...`);
socket.connect(PORT, CAMERA_IP);

function analyze() {
  console.log(`\nCaptured ${allData.length} bytes. Analyzing...\n`);

  // Find all NAL start codes (00 00 00 01)
  const nals = [];
  for (let i = 0; i < allData.length - 4; i++) {
    if (allData[i] === 0 && allData[i+1] === 0 && allData[i+2] === 0 && allData[i+3] === 1) {
      const nalByte = allData[i+4];
      const nalType = nalByte & 0x1f;
      const nalRefIdc = (nalByte >> 5) & 0x3;
      
      // Check if there's a 16-byte protocol header before this NAL
      let header = null;
      if (i >= 16) {
        // The 16 bytes before the NAL start code
        const hdr = allData.slice(i - 16, i);
        header = {
          raw: hdr.toString('hex'),
          field0: hdr.readUInt32LE(0),  // bytes 0-3
          field1: hdr.readUInt32LE(4),  // bytes 4-7
          field2: hdr.readUInt32LE(8),  // bytes 8-11
          field3: hdr.readUInt32LE(12), // bytes 12-15
        };
      }
      
      // For SPS, parse resolution
      let resolution = null;
      if (nalType === 7 && i + 20 < allData.length) {
        resolution = parseSpsResolution(allData, i + 4);
      }
      
      nals.push({ offset: i, nalType, nalRefIdc, header, resolution });
    }
  }

  console.log(`Found ${nals.length} NAL units\n`);
  
  // Print all NAL units with headers, focusing on SPS and IDR
  console.log('═══ NAL Units with Protocol Headers ═══\n');
  
  const headerPatterns = new Map(); // field3 → count and info
  
  for (const nal of nals) {
    const typeName = NAL_TYPES[nal.nalType] || `type${nal.nalType}`;
    
    if (nal.header) {
      const key = nal.header.field3;
      if (!headerPatterns.has(key)) {
        headerPatterns.set(key, { count: 0, nalTypes: new Set(), resolutions: new Set(), field0s: new Set(), field2s: new Set() });
      }
      const p = headerPatterns.get(key);
      p.count++;
      p.nalTypes.add(typeName);
      p.field0s.add(nal.header.field0);
      p.field2s.add(nal.header.field2);
      if (nal.resolution) p.resolutions.add(nal.resolution);
    }
    
    // Print details for SPS, IDR, and first few P-slices
    if (nal.nalType === 7 || nal.nalType === 8 || nal.nalType === 5 || nals.indexOf(nal) < 10) {
      const hdr = nal.header ? 
        `f0=${nal.header.field0} f1=${nal.header.field1} f2=${nal.header.field2} f3=${nal.header.field3}` : 
        'no header';
      console.log(`  [${nal.offset}] ${typeName} ref=${nal.nalRefIdc} | ${hdr}${nal.resolution ? ` | RES: ${nal.resolution}` : ''}`);
    }
  }

  // Analyze header field patterns
  console.log('\n═══ Header Field3 (potential channel ID) Analysis ═══\n');
  for (const [field3, info] of [...headerPatterns.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  field3=${field3}: ${info.count} NALs, types=[${[...info.nalTypes].join(',')}], resolutions=[${[...info.resolutions].join(',')}]`);
    console.log(`    field0 values: [${[...info.field0s].slice(0, 10).join(', ')}]`);
    console.log(`    field2 values: [${[...info.field2s].slice(0, 10).join(', ')}]`);
  }

  // Also check field0
  console.log('\n═══ Header Field0 (potential channel ID) Analysis ═══\n');
  const field0Patterns = new Map();
  for (const nal of nals) {
    if (!nal.header) continue;
    const key = nal.header.field0;
    if (!field0Patterns.has(key)) {
      field0Patterns.set(key, { count: 0, nalTypes: new Set(), resolutions: new Set(), field3s: new Set() });
    }
    const p = field0Patterns.get(key);
    p.count++;
    p.nalTypes.add(NAL_TYPES[nal.nalType] || `type${nal.nalType}`);
    p.field3s.add(nal.header.field3);
    if (nal.resolution) p.resolutions.add(nal.resolution);
  }
  for (const [field0, info] of [...field0Patterns.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  field0=${field0}: ${info.count} NALs, types=[${[...info.nalTypes].join(',')}], res=[${[...info.resolutions].join(',')}], field3=[${[...info.field3s].join(',')}]`);
  }
  
  // Check for other ports
  console.log('\n═══ Probing Other Ports for Per-Channel Streams ═══\n');
  probeOtherPorts().then(() => process.exit(0));
}

function parseSpsResolution(buf, spsStart) {
  // Quick hack: look at the SPS bytes to extract resolution
  // Full SPS parsing is complex; use known patterns
  const spsBytes = buf.slice(spsStart, spsStart + 30).toString('hex');
  
  // Known SPS for 1600x960
  if (spsBytes.includes('640028')) return '1600x960';
  // Known SPS for 640x360
  if (spsBytes.includes('42c028') || spsBytes.includes('42001e') || spsBytes.includes('640029')) return '640x360';
  if (spsBytes.includes('42e00a')) return '320x240';
  
  return `unknown(${spsBytes.slice(0, 20)})`;
}

async function probeOtherPorts() {
  const portsToProbe = [12346, 12347, 12348, 12349, 12350, 12351, 12352, 12353, 12354, 12355, 6666, 6667, 6668, 6669, 8000, 8001, 8002, 8003, 8004, 9000, 9001, 9002, 9003];
  
  for (const port of portsToProbe) {
    const result = await probePort(CAMERA_IP, port);
    if (result) {
      console.log(`  Port ${port}: ${result}`);
    }
  }
}

function probePort(ip, port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(2000);
    let gotData = false;
    
    sock.on('connect', () => {
      // Connected! Try to read some data
      setTimeout(() => {
        if (!gotData) {
          sock.destroy();
          resolve(`OPEN (no data)`);
        }
      }, 1500);
    });
    
    sock.on('data', (data) => {
      gotData = true;
      // Check if it's H264
      const hex = data.slice(0, 32).toString('hex');
      let info = `OPEN, got ${data.length} bytes, hex: ${hex.slice(0, 40)}`;
      if (hex.includes('00000001')) {
        info += ' ★ H264 detected!';
      }
      sock.destroy();
      resolve(info);
    });
    
    sock.on('timeout', () => { sock.destroy(); resolve(null); });
    sock.on('error', () => { sock.destroy(); resolve(null); });
    
    sock.connect(port, ip);
  });
}
