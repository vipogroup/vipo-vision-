import net from 'net';
const HOST = '10.0.0.9';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const sock = net.createConnection({ host: HOST, port: 23, timeout: 180000 });
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

// Step 1: Status from all 3 devices
console.log('╔═══════════════════════════════════════════════╗');
console.log('║  STEP 1: GET STATUS FROM ALL DEVICES          ║');
console.log('╚═══════════════════════════════════════════════╝\n');
console.log(await cmd('/tmp/motor_probe status 2>&1', 10000));

// Step 2: Run the safe movement test
console.log('\n╔═══════════════════════════════════════════════╗');
console.log('║  STEP 2: SAFE MOVEMENT TEST                   ║');
console.log('╚═══════════════════════════════════════════════╝\n');
console.log(await cmd('/tmp/motor_probe test 2>&1', 60000));

sock.destroy();
process.exit(0);
