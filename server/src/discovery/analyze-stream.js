/**
 * Analyze raw TCP stream from CloseLi camera port 12345
 * Captures raw bytes, finds H264 NAL units, identifies SPS/PPS/IDR frames
 */

import net from 'net';

const CAMERA_IP = process.argv[2] || '10.0.0.9';
const PORT = parseInt(process.argv[3]) || 12345;

const NAL_TYPES = {
  1: 'SLICE (P/B)',
  2: 'DPA',
  3: 'DPB',
  4: 'DPC',
  5: 'IDR (keyframe)',
  6: 'SEI',
  7: 'SPS',
  8: 'PPS',
  9: 'AUD',
};

const socket = new net.Socket();
let totalBytes = 0;
const allData = [];
let packetCount = 0;

socket.setTimeout(15000);

socket.on('data', (data) => {
  totalBytes += data.length;
  packetCount++;
  allData.push(data);
  
  if (packetCount <= 5) {
    console.log(`\nPacket #${packetCount}: ${data.length} bytes`);
    console.log(`  Hex (first 80 bytes): ${data.slice(0, 80).toString('hex')}`);
    
    // Look for NAL start codes in this packet
    for (let i = 0; i < Math.min(data.length, 200); i++) {
      if (i + 3 < data.length && data[i] === 0 && data[i+1] === 0 && data[i+2] === 0 && data[i+3] === 1) {
        const nalType = data[i+4] & 0x1f;
        console.log(`  NAL start code at offset ${i}: type=${nalType} (${NAL_TYPES[nalType] || 'unknown'})`);
      }
      if (i + 2 < data.length && data[i] === 0 && data[i+1] === 0 && data[i+2] === 1) {
        const nalType = data[i+3] & 0x1f;
        console.log(`  Short NAL start at offset ${i}: type=${nalType} (${NAL_TYPES[nalType] || 'unknown'})`);
      }
    }
  }
  
  if (totalBytes > 500000) {
    console.log(`\n--- Captured ${totalBytes} bytes in ${packetCount} packets ---`);
    
    // Concatenate all data and do full analysis
    const full = Buffer.concat(allData);
    console.log('\nFull NAL unit scan:');
    let nalCount = 0;
    const nalTypes = {};
    
    for (let i = 0; i < full.length - 4; i++) {
      if (full[i] === 0 && full[i+1] === 0 && full[i+2] === 0 && full[i+3] === 1) {
        const nalType = full[i+4] & 0x1f;
        const nalRefIdc = (full[i+4] >> 5) & 0x3;
        nalTypes[nalType] = (nalTypes[nalType] || 0) + 1;
        
        if (nalCount < 30 || nalType === 5 || nalType === 7 || nalType === 8) {
          console.log(`  [${i}] NAL type=${nalType} (${NAL_TYPES[nalType] || '?'}) ref_idc=${nalRefIdc}`);
        }
        nalCount++;
      }
    }
    
    console.log(`\nNAL type summary:`);
    for (const [type, count] of Object.entries(nalTypes)) {
      console.log(`  Type ${type} (${NAL_TYPES[type] || '?'}): ${count} occurrences`);
    }
    
    // Check if SPS was found
    if (nalTypes[7]) {
      console.log('\n★ SPS found! Stream CAN be used with copy mode if we start from SPS.');
      // Find first SPS position
      for (let i = 0; i < full.length - 4; i++) {
        if (full[i] === 0 && full[i+1] === 0 && full[i+2] === 0 && full[i+3] === 1) {
          const nalType = full[i+4] & 0x1f;
          if (nalType === 7) {
            console.log(`  First SPS at byte offset: ${i}`);
            console.log(`  SPS bytes: ${full.slice(i, i + 40).toString('hex')}`);
            break;
          }
        }
      }
    } else {
      console.log('\n⚠ No SPS found in captured data. Camera may not send keyframes frequently.');
    }
    
    socket.destroy();
  }
});

socket.on('timeout', () => {
  console.log('Timeout - analyzing what we have...');
  const full = Buffer.concat(allData);
  console.log(`Total: ${totalBytes} bytes, ${packetCount} packets`);
  
  for (let i = 0; i < full.length - 4; i++) {
    if (full[i] === 0 && full[i+1] === 0 && full[i+2] === 0 && full[i+3] === 1) {
      const nalType = full[i+4] & 0x1f;
      console.log(`  [${i}] NAL type=${nalType} (${NAL_TYPES[nalType] || '?'})`);
    }
  }
  socket.destroy();
});

socket.on('error', (err) => { console.error('Error:', err.message); });
socket.on('close', () => { console.log('Connection closed'); process.exit(0); });

console.log(`Connecting to ${CAMERA_IP}:${PORT}...`);
socket.connect(PORT, CAMERA_IP);
