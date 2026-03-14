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

// Re-upload binary
console.log('═══ UPLOADING motor_probe ═══');
console.log(await cmd(`wget -O /tmp/motor_probe http://${MY_IP}:8888/motor_probe`, 15000));
console.log(await cmd('chmod +x /tmp/motor_probe'));
console.log(await cmd('ls -la /tmp/motor_probe'));

// Verify it runs
console.log('\n═══ VERIFY ═══');
const verify = await cmd('/tmp/motor_probe 2>&1', 5000);
console.log(verify);

if (verify.includes('not found') || verify.includes('No such file')) {
  console.log('FATAL: Binary not uploaded or not executable');
  sock.destroy();
  process.exit(1);
}

// Step 1: Get status from all 3 devices
console.log('\n═══ STATUS (all devices) ═══');
console.log(await cmd('/tmp/motor_probe status 2>&1', 15000));

// Step 2: Run the safe movement test
// This takes up to ~60 seconds (3 devices × 12 steps with sleeps)
console.log('\n═══ MOVEMENT TEST ═══');
console.log('Running... (this takes ~60s, testing X and Y on all 3 devices)');

// Run test with output redirected to file, then read it
console.log(await cmd('/tmp/motor_probe test > /tmp/motor_test.log 2>&1', 5000));

// Wait for test to complete (it has sleep() calls totaling ~36s per device)
await sleep(90000);

// Read test results
console.log('\n═══ TEST RESULTS ═══');
console.log(await cmd('cat /tmp/motor_test.log 2>&1', 10000));

sock.destroy();
process.exit(0);
