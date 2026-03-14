import net from 'net';
const HOST = '10.0.0.9';
const MY_IP = '10.0.0.4';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const sock = net.createConnection({ host: HOST, port: 23, timeout: 120000 });
let buf = Buffer.alloc(0);
sock.on('data', (c) => { buf = Buffer.concat([buf, c]); });

function drain() {
  const d = buf.toString('utf-8').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  buf = Buffer.alloc(0);
  return d;
}

async function cmd(command, waitMs = 3000) {
  drain();
  sock.write(command + '\n');
  await sleep(waitMs);
  const raw = drain();
  const lines = raw.split(/\r?\n/);
  const filtered = lines.filter(l => {
    const t = l.trim();
    if (!t) return false;
    if (t.match(/^\[root@/)) return false;
    if (t === command.trim()) return false;
    return true;
  });
  return filtered.join('\n').trim();
}

await sleep(3000); drain();
sock.write('root\n'); await sleep(2000); drain();
sock.write('\n'); await sleep(2000); drain();
console.log('Connected to camera.\n');

// Step 1: Download motor_probe binary via wget
console.log('═══ STEP 1: DOWNLOAD motor_probe ═══');
console.log(await cmd(`wget -O /tmp/motor_probe http://${MY_IP}:8888/motor_probe 2>&1`, 15000));
console.log(await cmd('ls -la /tmp/motor_probe'));
console.log(await cmd('chmod +x /tmp/motor_probe'));

// Step 2: Verify it runs
console.log('\n═══ STEP 2: VERIFY BINARY ═══');
console.log(await cmd('/tmp/motor_probe 2>&1', 5000));

// Step 3: Run probe — try all ioctl cmds on all devices
console.log('\n═══ STEP 3: IOCTL PROBE (all cmds 0x0-0x10) ═══');
console.log(await cmd('/tmp/motor_probe probe 2>&1', 30000));

sock.destroy();
process.exit(0);
