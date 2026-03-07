import net from 'net';

function stripTelnetNegotiation(buf) {
  const result = [];
  let i = 0;
  while (i < buf.length) {
    if (buf[i] === 0xff && i + 2 < buf.length) {
      i += 3;
    } else {
      result.push(buf[i]);
      i += 1;
    }
  }
  return Buffer.from(result);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export class CloseLiTelnet {
  constructor(host, port = 23, timeout = 10000) {
    this.host = host;
    this.port = port;
    this.timeout = timeout;
    this.sock = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ host: this.host, port: this.port, timeout: this.timeout }, async () => {
        this.sock = sock;
        try {
          await sleep(2000);
          let raw = this._drain();
          const text = stripTelnetNegotiation(raw).toString('utf-8');
          if (text.toLowerCase().includes('login')) {
            sock.write('root\n');
            await sleep(1000);
            raw = this._drain();
            const resp = stripTelnetNegotiation(raw).toString('utf-8');
            if (resp.toLowerCase().includes('password')) {
              sock.write('\n');
              await sleep(1000);
              this._drain();
            }
          }
          resolve(true);
        } catch (err) {
          reject(err);
        }
      });
      sock.on('error', reject);
      sock.on('timeout', () => reject(new Error('Telnet connection timeout')));
      this._pending = Buffer.alloc(0);
      sock.on('data', (chunk) => {
        this._pending = Buffer.concat([this._pending, chunk]);
      });
    });
  }

  _drain() {
    const buf = this._pending;
    this._pending = Buffer.alloc(0);
    return buf;
  }

  async cmd(command, waitMs = 2000) {
    if (!this.sock) throw new Error('Not connected');
    this._drain();
    this.sock.write(command + '\n');
    await sleep(waitMs);
    const raw = this._drain();
    let text = stripTelnetNegotiation(raw).toString('utf-8');
    text = text.replace(/\x1b\[[0-9;]*m/g, '');
    return text;
  }

  close() {
    if (this.sock) {
      try { this.sock.destroy(); } catch { /* */ }
      this.sock = null;
    }
  }
}

export async function ensureHttpd(telnet, port = 8080) {
  const output = await telnet.cmd('/bin/busybox ps | /bin/busybox grep httpd', 2000);
  if (output.includes('httpd -p')) {
    return true;
  }
  await telnet.cmd(`/bin/busybox httpd -p ${port} -h /media/ -f &`, 2000);
  await sleep(1000);
  const check = await telnet.cmd('/bin/busybox ps | /bin/busybox grep httpd', 2000);
  return check.includes('httpd -p');
}

export async function findLatestRecording(telnet, channel, afterFile = null) {
  const dirOutput = await telnet.cmd(`/bin/busybox ls /media/${channel}/rawdata/ 2>/dev/null`, 2000);
  const dates = [];
  for (const token of dirOutput.split(/\s+/)) {
    const t = token.trim();
    if (t.length === 10 && t[4] === '-' && /^\d{4}/.test(t)) {
      dates.push(t);
    }
  }
  dates.sort();
  if (dates.length === 0) return null;

  for (const dateStr of dates.slice(-2).reverse()) {
    const hourOutput = await telnet.cmd(`/bin/busybox ls /media/${channel}/rawdata/${dateStr}/ 2>/dev/null`, 2000);
    // Keep directory names as-is (zero-padded: "00", "01", etc.)
    const hours = [];
    for (const token of hourOutput.split(/\s+/)) {
      const t = token.trim();
      if (/^\d{1,2}$/.test(t) && Number(t) >= 0 && Number(t) <= 23) {
        hours.push(t);
      }
    }
    hours.sort();
    if (hours.length === 0) continue;

    // Use the raw directory name string (e.g. "01" not 1)
    const hour = hours[hours.length - 1];
    const fileOutput = await telnet.cmd(`/bin/busybox ls /media/${channel}/rawdata/${dateStr}/${hour}/ 2>/dev/null`, 3000);
    const files = [];
    for (const token of fileOutput.split(/\s+/)) {
      const t = token.trim();
      // Match numeric filenames (not .txt or .tmp)
      if (/^\d+$/.test(t) && t.length > 8) {
        files.push(t);
      }
    }
    files.sort();

    if (files.length > 0) {
      if (afterFile) {
        // Find the next file after the one we already played
        const idx = files.indexOf(afterFile);
        if (idx >= 0 && idx < files.length - 1) {
          const fname = files[idx + 1];
          return { fname, dateStr, hour, channel };
        }
        // If afterFile is the last one, no new file yet
        if (idx === files.length - 1) {
          return null;
        }
      }
      // No afterFile or afterFile not found — return latest
      const fname = files[files.length - 1];
      return { fname, dateStr, hour, channel };
    }
  }
  return null;
}

export async function getCloseLiStreamUrl(ip, port, channel, afterFile = null) {
  const telnet = new CloseLiTelnet(ip);
  try {
    await telnet.connect();
    const httpdOk = await ensureHttpd(telnet, port);
    if (!httpdOk) {
      telnet.close();
      return null;
    }
    const rec = await findLatestRecording(telnet, channel, afterFile);
    telnet.close();
    if (!rec) return null;
    return { url: `http://${ip}:${port}/${rec.channel}/rawdata/${rec.dateStr}/${rec.hour}/${rec.fname}`, fname: rec.fname };
  } catch {
    telnet.close();
    return null;
  }
}
