/**
 * Test: connect to port 12346, send channel selection, and see if we get
 * a per-channel H264 stream back.
 */
import net from 'net';

const CAMERA_IP = process.argv[2] || '10.0.0.9';
const CHANNEL = parseInt(process.argv[3]) || 0; // 0-3
const FIELD3 = CHANNEL * 3; // channel ID in protocol: 0, 3, 6, 9

const NAL_TYPES = { 1: 'P-slice', 5: 'IDR', 7: 'SPS', 8: 'PPS' };

console.log(`Testing channel ${CHANNEL} (field3=${FIELD3}) on ${CAMERA_IP}:12346`);

const socket = new net.Socket();
let totalBytes = 0;
let chunks = [];
let headerSent = false;

socket.setTimeout(15000);

socket.on('connect', () => {
  console.log('Connected to port 12346');
  
  // Send 16-byte channel selection header
  const buf = Buffer.alloc(16);
  buf.writeUInt32LE(0, 0);
  buf.writeUInt32LE(1, 4);
  buf.writeUInt32LE(0, 8);
  buf.writeUInt32LE(FIELD3, 12);
  socket.write(buf);
  headerSent = true;
  console.log(`Sent channel select: field3=${FIELD3}`);
});

socket.on('data', (data) => {
  totalBytes += data.length;
  chunks.push(data);
  
  if (chunks.length <= 3) {
    console.log(`Packet #${chunks.length}: ${data.length} bytes, hex=${data.slice(0, 60).toString('hex')}`);
  }
  
  if (totalBytes > 500000) {
    console.log(`\nGot ${totalBytes} bytes total. Analyzing...`);
    
    const full = Buffer.concat(chunks);
    // Find NAL units
    let nalCount = 0;
    const nalTypes = {};
    let spsCount = 0;
    
    for (let i = 0; i < full.length - 4; i++) {
      if (full[i] === 0 && full[i+1] === 0 && full[i+2] === 0 && full[i+3] === 1) {
        const nalType = full[i+4] & 0x1f;
        nalTypes[nalType] = (nalTypes[nalType] || 0) + 1;
        nalCount++;
        
        if (nalType === 7) {
          spsCount++;
          // Check 16-byte header before
          if (i >= 16) {
            const hdr = full.slice(i-16, i);
            const f3 = hdr.readUInt32LE(12);
            const spsHex = full.slice(i+4, i+12).toString('hex');
            console.log(`  SPS #${spsCount} at offset ${i}: field3=${f3}, sps_bytes=${spsHex}`);
          }
        }
      }
    }
    
    console.log(`\nNAL summary: ${nalCount} total`);
    for (const [type, count] of Object.entries(nalTypes)) {
      console.log(`  Type ${type} (${NAL_TYPES[type] || '?'}): ${count}`);
    }
    
    // Check if ALL field3 values are for our channel only
    const field3Values = new Set();
    for (let i = 16; i < full.length - 4; i++) {
      if (full[i] === 0 && full[i+1] === 0 && full[i+2] === 0 && full[i+3] === 1) {
        if (i >= 16) {
          const f3 = full.slice(i-16, i).readUInt32LE(12);
          if (f3 < 100) field3Values.add(f3); // ignore garbage values
        }
      }
    }
    console.log(`\nfield3 values found: [${[...field3Values].sort((a,b)=>a-b).join(', ')}]`);
    console.log(`Expected for channel ${CHANNEL}: main=${FIELD3}, sub=${FIELD3+1}`);
    
    const onlyOurChannel = [...field3Values].every(v => Math.floor(v / 3) === CHANNEL);
    console.log(`\n${onlyOurChannel ? '★ SUCCESS: Stream contains ONLY our channel!' : '⚠ Stream contains OTHER channels too'}`);
    
    socket.destroy();
  }
});

socket.on('timeout', () => {
  console.log(`Timeout. Total bytes received: ${totalBytes}`);
  socket.destroy();
});

socket.on('error', (err) => { console.error('Error:', err.message); });
socket.on('close', () => { console.log('Connection closed'); process.exit(0); });

socket.connect(12346, CAMERA_IP);
