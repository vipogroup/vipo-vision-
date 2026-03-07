/**
 * Probe port 12346 — might be a control/command port.
 * Try sending various commands and see what comes back.
 */
import net from 'net';

const CAMERA_IP = process.argv[2] || '10.0.0.9';

async function probeWithCommand(port, command, label, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let data = Buffer.alloc(0);
    let done = false;
    
    const finish = () => {
      if (done) return;
      done = true;
      socket.destroy();
      if (data.length > 0) {
        console.log(`  [${label}] Got ${data.length} bytes: hex=${data.slice(0, 40).toString('hex')}`);
        // Check for H264
        if (data.toString('hex').includes('00000001')) {
          console.log(`    ★ H264 NAL detected!`);
        }
        resolve(data);
      } else {
        console.log(`  [${label}] No response`);
        resolve(null);
      }
    };
    
    socket.setTimeout(timeout);
    socket.on('data', (chunk) => { data = Buffer.concat([data, chunk]); if (data.length > 4096) finish(); });
    socket.on('timeout', finish);
    socket.on('error', (err) => { console.log(`  [${label}] Error: ${err.message}`); done = true; socket.destroy(); resolve(null); });
    socket.on('close', finish);
    
    socket.connect(port, CAMERA_IP, () => {
      if (command) {
        if (Buffer.isBuffer(command)) {
          socket.write(command);
        } else {
          socket.write(command);
        }
      }
    });
  });
}

async function main() {
  console.log(`\n═══ Probing ${CAMERA_IP}:12346 with various commands ═══\n`);

  // Try text commands
  const textCmds = [
    'GET / HTTP/1.0\r\n\r\n',
    'channel 0\n',
    'channel 1\n',
    'stream 0\n',
    '{"cmd":"get_channel","channel":0}\n',
    '0\n',
    '1\n',
    '2\n',
    '3\n',
  ];
  
  for (const cmd of textCmds) {
    await probeWithCommand(12346, cmd, cmd.trim().slice(0, 30));
  }

  // Try binary commands — channel selection packets
  console.log(`\n═══ Trying binary channel-select packets ═══\n`);

  // Try sending a 4-byte channel number
  for (let ch = 0; ch < 4; ch++) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(ch);
    await probeWithCommand(12346, buf, `binary LE ch=${ch}`);
  }

  // Try sending the channel field3 values (0, 3, 6, 9)
  for (const f3 of [0, 3, 6, 9]) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(f3);
    await probeWithCommand(12346, buf, `binary LE field3=${f3}`);
  }

  // Try the 16-byte header format from port 12345
  for (let ch = 0; ch < 4; ch++) {
    const buf = Buffer.alloc(16);
    buf.writeUInt32LE(0, 0);      // tag
    buf.writeUInt32LE(1, 4);      // always 1
    buf.writeUInt32LE(0, 8);      // length
    buf.writeUInt32LE(ch * 3, 12); // channel field3
    await probeWithCommand(12346, buf, `16byte hdr ch=${ch}`);
  }

  // Try just connecting and waiting longer (maybe it needs time)
  console.log(`\n═══ Just connecting and waiting 5s ═══\n`);
  await probeWithCommand(12346, null, 'no-command', 5000);
  
  // Also probe port 12345 with a channel selector prefix
  console.log(`\n═══ Port 12345: Try sending channel before reading ═══\n`);
  for (let ch = 0; ch < 4; ch++) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(ch);
    await probeWithCommand(12345, buf, `12345 + ch=${ch} prefix`, 3000);
  }

  console.log('\nDone.');
}

main().catch(console.error);
