/**
 * Test script: Connect to CloseLi camera via Telnet, start httpd, find recordings.
 */
import net from 'net';
import http from 'http';

const IP = '10.0.0.9';
const TELNET_PORT = 23;
const HTTP_PORT = 8080;
const CHANNEL = 'xxxxS_aa3842e77c14';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stripNeg(buf) {
  const r = [];
  let i = 0;
  while (i < buf.length) {
    if (buf[i] === 0xff && i + 2 < buf.length) i += 3;
    else { r.push(buf[i]); i++; }
  }
  return Buffer.from(r);
}

class Telnet {
  constructor() { this.sock = null; this.buf = Buffer.alloc(0); }

  connect() {
    return new Promise((resolve, reject) => {
      this.sock = net.createConnection({ host: IP, port: TELNET_PORT, timeout: 10000 }, () => {
        console.log('✓ Telnet connected');
        resolve();
      });
      this.sock.on('data', d => { this.buf = Buffer.concat([this.buf, d]); });
      this.sock.on('error', reject);
      this.sock.on('timeout', () => reject(new Error('timeout')));
    });
  }

  drain() {
    const b = stripNeg(this.buf).toString('utf-8').replace(/\x1b\[[0-9;]*m/g, '');
    this.buf = Buffer.alloc(0);
    return b;
  }

  async cmd(c, wait = 2000) {
    this.drain();
    this.sock.write(c + '\n');
    await sleep(wait);
    return this.drain();
  }

  async login() {
    await sleep(2000);
    let text = this.drain();
    if (text.toLowerCase().includes('login')) {
      this.sock.write('root\n');
      await sleep(1000);
      text = this.drain();
      if (text.toLowerCase().includes('password')) {
        this.sock.write('\n');
        await sleep(1000);
        this.drain();
      }
    }
    console.log('✓ Logged in as root');
  }

  close() { if (this.sock) this.sock.destroy(); }
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      let data = [];
      res.on('data', c => data.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(data), headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function main() {
  console.log(`\n=== CloseLi Camera Test ===`);
  console.log(`Camera: ${IP}:${HTTP_PORT}, Telnet: ${TELNET_PORT}`);
  console.log(`Channel: ${CHANNEL}\n`);

  // 1. Telnet connect + login
  const t = new Telnet();
  try {
    await t.connect();
    await t.login();
  } catch (e) {
    console.log('✗ Telnet failed:', e.message);
    process.exit(1);
  }

  // 2. Ensure httpd
  let out = await t.cmd('/bin/busybox ps | /bin/busybox grep httpd');
  if (out.includes('httpd -p')) {
    console.log('✓ httpd already running');
  } else {
    console.log('  Starting httpd...');
    await t.cmd(`/bin/busybox httpd -p ${HTTP_PORT} -h /media/ -f &`);
    await sleep(1000);
    out = await t.cmd('/bin/busybox ps | /bin/busybox grep httpd');
    console.log(out.includes('httpd -p') ? '✓ httpd started' : '✗ httpd failed to start');
  }

  // 3. Find latest recordings
  console.log(`\n--- Finding recordings for ${CHANNEL} ---`);
  out = await t.cmd(`/bin/busybox ls /media/${CHANNEL}/rawdata/ 2>/dev/null`);
  console.log('Dates:', out.trim());

  const dates = [];
  for (const tok of out.split(/\s+/)) {
    if (tok.length === 10 && tok[4] === '-' && /^\d{4}/.test(tok)) dates.push(tok);
  }
  dates.sort();
  console.log('Parsed dates:', dates);

  if (dates.length === 0) {
    console.log('✗ No recording dates found');
    // Try listing /media/ to see what's there
    out = await t.cmd('/bin/busybox ls /media/ 2>/dev/null');
    console.log('Contents of /media/:', out.trim());
    t.close();
    process.exit(1);
  }

  const dateStr = dates[dates.length - 1];
  out = await t.cmd(`/bin/busybox ls /media/${CHANNEL}/rawdata/${dateStr}/ 2>/dev/null`);
  console.log(`Hours for ${dateStr}:`, out.trim());

  const hours = [];
  for (const tok of out.split(/\s+/)) {
    if (/^\d+$/.test(tok.trim()) && Number(tok) >= 0 && Number(tok) <= 23) hours.push(Number(tok));
  }
  hours.sort((a, b) => a - b);

  if (hours.length === 0) {
    console.log('✗ No hours found');
    t.close();
    process.exit(1);
  }

  const hour = hours[hours.length - 1];
  out = await t.cmd(`/bin/busybox ls /media/${CHANNEL}/rawdata/${dateStr}/${hour}/ 2>/dev/null`, 3000);
  console.log(`Files for ${dateStr}/${hour}:`, out.trim().substring(0, 200));

  const files = [];
  for (const tok of out.split(/\s+/)) {
    if (/^\d+$/.test(tok.trim()) && tok.trim().length > 8) files.push(tok.trim());
  }
  files.sort();

  if (files.length === 0) {
    console.log('✗ No recording files found');
    t.close();
    process.exit(1);
  }

  const fname = files[files.length - 1];
  const url = `http://${IP}:${HTTP_PORT}/${CHANNEL}/rawdata/${dateStr}/${hour}/${fname}`;
  console.log(`\n✓ Latest recording: ${url}`);

  t.close();

  // 4. Test HTTP download
  console.log(`\n--- Testing HTTP download ---`);
  try {
    const resp = await httpGet(url);
    console.log(`✓ HTTP ${resp.status}, size: ${resp.body.length} bytes, content-type: ${resp.headers['content-type'] || 'unknown'}`);

    if (resp.status === 200 && resp.body.length > 1000) {
      console.log(`\n✓✓✓ SUCCESS — Camera stream URL works!`);
      console.log(`URL: ${url}`);
      console.log(`\nTo test with FFmpeg:`);
      console.log(`  ffmpeg -i "${url}" -c copy -f hls -hls_time 1 -hls_list_size 6 test.m3u8`);
    } else {
      console.log(`✗ Unexpected response`);
    }
  } catch (e) {
    console.log('✗ HTTP failed:', e.message);
  }

  process.exit(0);
}

main();
