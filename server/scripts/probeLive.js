import net from 'net';
import http from 'http';

const IP = '10.0.0.9';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function strip(b) { const r = []; let i = 0; while (i < b.length) { if (b[i] === 0xff && i + 2 < b.length) i += 3; else { r.push(b[i]); i++; } } return Buffer.from(r); }

class T {
  constructor() { this.s = null; this.b = Buffer.alloc(0); }
  connect() { return new Promise((ok, no) => { this.s = net.createConnection({ host: IP, port: 23, timeout: 10000 }, () => ok()); this.s.on('data', d => { this.b = Buffer.concat([this.b, d]); }); this.s.on('error', no); }); }
  d() { const t = strip(this.b).toString().replace(/\x1b\[[0-9;]*m/g, ''); this.b = Buffer.alloc(0); return t; }
  async c(cmd, w = 2000) { this.d(); this.s.write(cmd + '\n'); await sleep(w); return this.d(); }
  async login() { await sleep(2000); let t = this.d(); if (t.includes('login')) { this.s.write('root\n'); await sleep(1000); t = this.d(); if (t.includes('assword')) { this.s.write('\n'); await sleep(1000); this.d(); } } }
}

function httpGet(url, maxBytes = 50000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      let data = [];
      let total = 0;
      res.on('data', c => { data.push(c); total += c.length; if (total > maxBytes) { req.destroy(); resolve({ status: res.statusCode, size: total, partial: true }); } });
      res.on('end', () => resolve({ status: res.statusCode, size: total, partial: false }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function main() {
  const t = new T();
  await t.connect();
  await t.login();
  console.log('=== Connected ===\n');

  // Find the .tmp file (currently recording)
  let o = await t.c('/bin/busybox find /media/xxxxS_aa3842e77c14/rawdata/2026-03-06/ -name "*.tmp" 2>/dev/null', 3000);
  console.log('TMP files (currently recording):', o.trim());

  // Check for live stream processes
  o = await t.c('/bin/busybox ps', 3000);
  const lines = o.split('\n').filter(l => /encoder|stream|rtsp|live|v4l|video|imp_|sample/i.test(l));
  console.log('\nRelevant processes:', lines.length ? lines.join('\n') : 'none');

  // Check video devices
  o = await t.c('/bin/busybox ls /dev/video* 2>/dev/null', 2000);
  console.log('\nVideo devices:', o.trim());

  // Check if there's a FIFO or pipe for live streaming
  o = await t.c('/bin/busybox ls -la /tmp/*.264 /tmp/*.h264 /tmp/stream* /tmp/live* 2>/dev/null', 2000);
  console.log('\nLive stream files in /tmp:', o.trim());

  // Check what's running on the IMP (Ingenic Media Platform)
  o = await t.c('/bin/busybox ls /system/bin/ 2>/dev/null', 2000);
  console.log('\nSystem binaries:', o.trim().substring(0, 500));

  // Try to find the .tmp file and test HTTP access
  const tmpMatch = o.match(/(\d+\.tmp)/);
  o = await t.c('/bin/busybox find /media/xxxxS_aa3842e77c14/rawdata/ -name "*.tmp" 2>/dev/null', 3000);
  const tmpFiles = o.match(/\/media\/[^\s]+\.tmp/g);
  if (tmpFiles && tmpFiles.length > 0) {
    const tmpPath = tmpFiles[0];
    // Convert filesystem path to HTTP URL: /media/X -> /X
    const httpPath = tmpPath.replace('/media/', '/');
    const url = `http://${IP}:8080${httpPath}`;
    console.log(`\nTesting .tmp file HTTP access: ${url}`);
    try {
      const resp = await httpGet(url);
      console.log(`  HTTP ${resp.status}, size: ${resp.size} bytes, partial: ${resp.partial}`);
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }

  t.s.destroy();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
