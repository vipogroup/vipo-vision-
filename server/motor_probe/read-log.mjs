import net from 'net';
const HOST = '10.0.0.9';
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
  return lines.filter(l => {
    const t = l.trim();
    if (!t) return false;
    if (t.match(/^\[root@/)) return false;
    if (t === command.trim()) return false;
    return true;
  }).join('\n').trim();
}

await sleep(3000); drain();
sock.write('root\n'); await sleep(2000); drain();
sock.write('\n'); await sleep(2000); drain();
console.log('Connected.\n');

// Read the full log in parts to avoid truncation
console.log('═══ /dev/motor SECTION ═══');
console.log(await cmd('sed -n "1,60p" /tmp/movement_test.log', 5000));

console.log('\n═══ /dev/motor1 SECTION ═══');
console.log(await cmd('sed -n "61,120p" /tmp/movement_test.log', 5000));

console.log('\n═══ /dev/motor2 SECTION ═══');
console.log(await cmd('sed -n "121,180p" /tmp/movement_test.log', 5000));

console.log('\n═══ TAIL ═══');
console.log(await cmd('tail -5 /tmp/movement_test.log', 3000));

// Also get word count to know total size
console.log('\n═══ LOG SIZE ═══');
console.log(await cmd('wc -l /tmp/movement_test.log'));

sock.destroy();
process.exit(0);
