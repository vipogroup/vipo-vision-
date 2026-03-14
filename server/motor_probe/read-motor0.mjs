import net from 'net';
const HOST = '10.0.0.9';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const sock = net.createConnection({ host: HOST, port: 23, timeout: 60000 });
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
  return raw.split(/\r?\n/).filter(l => {
    const t = l.trim();
    return t && !t.match(/^\[root@/) && t !== command.trim();
  }).join('\n').trim();
}

await sleep(3000); drain();
sock.write('root\n'); await sleep(2000); drain();
sock.write('\n'); await sleep(2000); drain();

// Read motor0 section (lines 1-75)
console.log('═══ /dev/motor (lines 1-40) ═══');
console.log(await cmd('sed -n "1,40p" /tmp/movement_test.log', 5000));

console.log('\n═══ /dev/motor (lines 41-75) ═══');
console.log(await cmd('sed -n "41,75p" /tmp/movement_test.log', 5000));

sock.destroy();
process.exit(0);
