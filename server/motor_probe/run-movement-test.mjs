import net from 'net';
const HOST = '10.0.0.9';
const MY_IP = '10.0.0.4';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const sock = net.createConnection({ host: HOST, port: 23, timeout: 300000 });
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
console.log('Connected.\n');

// Step 1: Upload v2 binary
console.log('═══ UPLOAD ═══');
console.log(await cmd(`wget -O /tmp/motor_probe http://${MY_IP}:8888/motor_probe`, 15000));
console.log(await cmd('chmod +x /tmp/motor_probe'));

// Step 2: Copy to stable path
console.log('\n═══ COPY TO STABLE PATH ═══');
// Try /root first, then /config, then /media
console.log(await cmd('cp /tmp/motor_probe /root/motor_probe 2>&1'));
console.log(await cmd('chmod +x /root/motor_probe'));
const verify = await cmd('ls -la /root/motor_probe 2>&1');
console.log(verify);

let probePath = '/root/motor_probe';
if (verify.includes('No such file')) {
  console.log('Trying /config...');
  console.log(await cmd('cp /tmp/motor_probe /config/motor_probe 2>&1'));
  console.log(await cmd('chmod +x /config/motor_probe'));
  console.log(await cmd('ls -la /config/motor_probe'));
  probePath = '/config/motor_probe';
}

// Verify v2 runs
console.log('\n═══ VERIFY V2 ═══');
console.log(await cmd(`${probePath} 2>&1`, 3000));

// Step 3: Get baseline status
console.log('\n═══ BASELINE STATUS ═══');
console.log(await cmd(`${probePath} status 2>&1`, 10000));

// Step 4: Run full movement test — redirect to file since it's long
console.log('\n═══ RUNNING FULL MOVEMENT TEST ═══');
console.log('Running test on all 3 devices (±5 then ±20, X and Y)...');
console.log('Output goes to /tmp/movement_test.log');

// Run as background and wait
await cmd(`${probePath} test > /tmp/movement_test.log 2>&1 &`, 2000);

// Wait for test: 3 devices × 8 moves × ~0.7s each = ~17s + overhead
await sleep(30000);

// Read results
console.log('\n═══ MOVEMENT TEST RESULTS ═══');
const results = await cmd('cat /tmp/movement_test.log 2>&1', 15000);
console.log(results);

// If output was truncated, try to get the rest
if (!results.includes('ALL TESTS COMPLETE')) {
  console.log('\n(Waiting for test to finish...)');
  await sleep(20000);
  console.log(await cmd('cat /tmp/movement_test.log 2>&1', 15000));
}

// Final status after all tests
console.log('\n═══ FINAL STATUS AFTER ALL TESTS ═══');
console.log(await cmd(`${probePath} status 2>&1`, 10000));

sock.destroy();
process.exit(0);
