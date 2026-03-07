/**
 * CloseLi Camera Probe — discovers live stream and PTZ motor capabilities
 * 
 * Usage: node closeli-probe.js [camera-ip] [http-port]
 */

import net from 'net';
import http from 'http';

const CAMERA_IP = process.argv[2] || '10.0.0.9';
const HTTP_PORT = parseInt(process.argv[3]) || 8080;
const TELNET_PORT = 23;

const results = {
  ip: CAMERA_IP,
  rtsp: [],
  mjpeg: [],
  httpEndpoints: [],
  telnetCommands: [],
  ptzCapable: false,
  liveStreamUrl: null,
};

// ─── TCP Port Probe ──────────────────────────────────────────────
function tcpProbe(ip, port, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, ip);
  });
}

// ─── HTTP GET probe ──────────────────────────────────────────────
function httpGet(ip, port, path, timeout = 5000) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: ip, port, path, timeout }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk.toString();
        if (body.length > 8192) res.destroy();
      });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: body.slice(0, 8192) }));
      res.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// ─── Telnet command runner ────────────────────────────────────────
function telnetCommand(ip, command, timeout = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let output = '';
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(output);
    };

    socket.setTimeout(timeout);
    socket.on('timeout', finish);
    socket.on('error', () => { done = true; socket.destroy(); resolve(null); });
    socket.on('close', finish);
    socket.on('data', (data) => {
      output += data.toString();
      // Wait for prompt or enough data
      if (output.includes('#') || output.includes('$') || output.length > 4096) {
        // Send command after login prompt
        if (!output.includes(command) && output.includes('#')) {
          socket.write(command + '\n');
        }
      }
    });

    socket.connect(TELNET_PORT, ip, () => {
      // Some CloseLi cameras auto-login, some need root
      setTimeout(() => {
        socket.write('root\n');
        setTimeout(() => {
          socket.write('\n'); // empty password
          setTimeout(() => {
            socket.write(command + '\n');
            setTimeout(finish, 3000);
          }, 1000);
        }, 500);
      }, 1000);
    });
  });
}

// ─── 1. Probe TCP ports ──────────────────────────────────────────
async function probePorts() {
  console.log('\n═══ 1. TCP Port Scan ═══');
  const ports = [23, 80, 443, 554, 1935, 8080, 8443, 8554, 8899, 9000, 6667];
  const open = [];
  for (const port of ports) {
    const isOpen = await tcpProbe(CAMERA_IP, port);
    if (isOpen) {
      open.push(port);
      console.log(`  ✓ Port ${port} — OPEN`);
    } else {
      console.log(`  ✗ Port ${port} — closed`);
    }
  }
  return open;
}

// ─── 2. Probe HTTP endpoints ─────────────────────────────────────
async function probeHttp(port) {
  console.log(`\n═══ 2. HTTP Endpoint Probe (port ${port}) ═══`);
  
  const endpoints = [
    // Common camera CGI endpoints
    '/',
    '/get_status.cgi',
    '/get_params.cgi',
    '/cgi-bin/hi3510/param.cgi?cmd=getserverinfo',
    '/cgi-bin/hi3510/param.cgi?cmd=getmotorattr',
    '/cgi-bin/hi3510/param.cgi?cmd=getinfrared',
    '/cgi-bin/hi3510/param.cgi?cmd=getvencattr',
    '/cgi-bin/hi3510/param.cgi?cmd=getvideoattr',
    // Motor / PTZ
    '/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=up',
    '/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=down',
    '/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=left',
    '/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=right',
    '/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=stop',
    '/cgi-bin/hi3510/preset.cgi?-act=set&-number=0',
    // MJPEG / snapshot
    '/cgi-bin/hi3510/snap.cgi',
    '/cgi-bin/hi3510/mjpegstream.cgi',
    '/tmpfs/snap.jpg',
    '/tmpfs/auto.jpg',
    '/snap.jpg',
    '/snapshot.cgi',
    '/image/jpeg.cgi',
    '/video.cgi',
    '/videostream.cgi',
    '/mjpeg',
    '/mjpeg.cgi',
    '/stream',
    '/live/ch00_0',
    '/live',
    // Ingenic specific
    '/system/param.cgi',
    '/web/cgi-bin/hi3510/param.cgi?cmd=getserverinfo',
    // RTSP info
    '/onvif/device_service',
  ];

  for (const ep of endpoints) {
    const resp = await httpGet(CAMERA_IP, port, ep, 3000);
    if (resp && resp.status < 500) {
      const ct = resp.headers['content-type'] || '';
      const bodyPreview = resp.body.replace(/\s+/g, ' ').slice(0, 200);
      console.log(`  [${resp.status}] ${ep}`);
      console.log(`        Content-Type: ${ct}`);
      console.log(`        Body: ${bodyPreview}`);
      results.httpEndpoints.push({ path: ep, status: resp.status, contentType: ct, body: resp.body.slice(0, 500) });

      // Check for MJPEG
      if (ct.includes('multipart') || ct.includes('mjpeg') || ct.includes('jpeg')) {
        results.mjpeg.push(`http://${CAMERA_IP}:${port}${ep}`);
        console.log(`        ★ MJPEG/JPEG stream found!`);
      }
      // Check for motor/PTZ capability
      if (ep.includes('ptz') && resp.status === 200) {
        results.ptzCapable = true;
        console.log(`        ★ PTZ endpoint responded!`);
      }
      if (resp.body.includes('motor') || resp.body.includes('ptz') || resp.body.includes('PTZ')) {
        results.ptzCapable = true;
        console.log(`        ★ Motor/PTZ capability detected!`);
      }
    }
  }

  // Also try port 80 if different
  if (port !== 80) {
    console.log(`\n  --- Also probing port 80 ---`);
    for (const ep of ['/', '/get_status.cgi', '/cgi-bin/hi3510/param.cgi?cmd=getserverinfo', '/tmpfs/snap.jpg', '/snap.jpg']) {
      const resp = await httpGet(CAMERA_IP, 80, ep, 3000);
      if (resp && resp.status < 500) {
        console.log(`  [${resp.status}] :80${ep} — ${(resp.headers['content-type'] || '').slice(0, 60)}`);
        console.log(`        Body: ${resp.body.replace(/\s+/g, ' ').slice(0, 200)}`);
      }
    }
  }
}

// ─── 3. Probe RTSP ───────────────────────────────────────────────
async function probeRtsp(openPorts) {
  console.log('\n═══ 3. RTSP Probe ═══');
  const rtspPorts = [554, 8554].filter(p => openPorts.includes(p));

  if (rtspPorts.length === 0) {
    console.log('  No RTSP ports open. Checking via Telnet if RTSP can be started...');
    
    // Try to find rtsp server binary on camera
    const findRtsp = await telnetCommand(CAMERA_IP, 'find / -name "*rtsp*" -o -name "*live555*" -o -name "*v4l2*" 2>/dev/null | head -20');
    if (findRtsp) {
      console.log('  Telnet search for RTSP binaries:');
      console.log('  ' + findRtsp.split('\n').filter(l => l.includes('/')).join('\n  '));
    }

    // Check running processes
    const procs = await telnetCommand(CAMERA_IP, 'ps | grep -i "rtsp\\|stream\\|v4l\\|video\\|motor\\|ptz"');
    if (procs) {
      console.log('  Running video/motor processes:');
      console.log('  ' + procs.split('\n').filter(l => l.includes('grep') === false && l.trim().length > 5).join('\n  '));
    }
  } else {
    for (const port of rtspPorts) {
      console.log(`  RTSP port ${port} is open!`);
      const paths = ['/stream0', '/stream1', '/live/ch00_0', '/h264', '/Streaming/Channels/101', '/cam/realmonitor?channel=1&subtype=0', '/'];
      for (const p of paths) {
        results.rtsp.push(`rtsp://${CAMERA_IP}:${port}${p}`);
      }
      console.log(`  Possible RTSP URLs:`);
      results.rtsp.forEach(u => console.log(`    ${u}`));
    }
  }
}

// ─── 4. Telnet deep dive ─────────────────────────────────────────
async function telnetDeepDive() {
  console.log('\n═══ 4. Telnet Deep Dive ═══');

  // Check for motor / PTZ processes
  console.log('\n  --- System Info ---');
  const uname = await telnetCommand(CAMERA_IP, 'uname -a');
  if (uname) {
    const lines = uname.split('\n').filter(l => l.includes('Linux'));
    console.log('  ' + (lines[0] || 'N/A'));
  }

  // Check for motor device
  console.log('\n  --- Motor/PTZ devices ---');
  const motorDevs = await telnetCommand(CAMERA_IP, 'ls -la /dev/motor* /dev/ptz* /dev/step* /dev/gpio* 2>/dev/null');
  if (motorDevs) {
    const lines = motorDevs.split('\n').filter(l => l.includes('/dev/'));
    if (lines.length > 0) {
      lines.forEach(l => console.log('  ' + l.trim()));
      results.ptzCapable = true;
    } else {
      console.log('  No motor devices found in /dev/');
    }
  }

  // Check for motor processes
  console.log('\n  --- Motor/video processes ---');
  const ps = await telnetCommand(CAMERA_IP, 'ps aux 2>/dev/null || ps');
  if (ps) {
    const lines = ps.split('\n').filter(l => 
      /motor|ptz|ipc|rtsp|video|v4l|stream|jpeg|mjpeg|onvif/i.test(l) && !l.includes('grep')
    );
    if (lines.length > 0) {
      lines.forEach(l => console.log('  ' + l.trim()));
    } else {
      console.log('  No motor/video processes found');
    }
  }

  // Check for CGI scripts
  console.log('\n  --- CGI scripts on filesystem ---');
  const cgi = await telnetCommand(CAMERA_IP, 'find / -path "*/cgi*" -name "*.cgi" 2>/dev/null | head -20');
  if (cgi) {
    const lines = cgi.split('\n').filter(l => l.includes('.cgi'));
    if (lines.length > 0) {
      lines.forEach(l => console.log('  ' + l.trim()));
    } else {
      console.log('  No CGI scripts found');
    }
  }

  // Check for RTSP / streaming binaries
  console.log('\n  --- Streaming binaries ---');
  const bins = await telnetCommand(CAMERA_IP, 'ls /usr/bin/*stream* /usr/bin/*rtsp* /usr/bin/*video* /usr/bin/*ipc* /usr/bin/*motor* /usr/sbin/*stream* /usr/sbin/*rtsp* /tmp/*stream* 2>/dev/null');
  if (bins) {
    const lines = bins.split('\n').filter(l => l.includes('/') && !l.includes('No such'));
    if (lines.length > 0) {
      lines.forEach(l => console.log('  ' + l.trim()));
    }
  }

  // Check /tmp for any streaming fifos or sockets
  console.log('\n  --- /tmp streaming files ---');
  const tmp = await telnetCommand(CAMERA_IP, 'ls -la /tmp/*.fifo /tmp/*.sock /tmp/*stream* /tmp/*rtsp* /tmp/*video* /tmp/*ipc* 2>/dev/null');
  if (tmp) {
    const lines = tmp.split('\n').filter(l => l.includes('/tmp/'));
    if (lines.length > 0) {
      lines.forEach(l => console.log('  ' + l.trim()));
    }
  }

  // Check network listeners
  console.log('\n  --- Network listeners ---');
  const netstat = await telnetCommand(CAMERA_IP, 'netstat -tlnp 2>/dev/null || ss -tlnp');
  if (netstat) {
    const lines = netstat.split('\n').filter(l => /LISTEN|State/i.test(l));
    lines.forEach(l => console.log('  ' + l.trim()));
  }
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  CloseLi Camera Probe — ${CAMERA_IP}:${HTTP_PORT}      ║`);
  console.log(`╚══════════════════════════════════════════════╝`);

  const openPorts = await probePorts();
  await probeHttp(HTTP_PORT);
  await probeRtsp(openPorts);
  await telnetDeepDive();

  console.log('\n\n═══ SUMMARY ═══');
  console.log(`Camera IP: ${CAMERA_IP}`);
  console.log(`Open ports: ${openPorts.join(', ')}`);
  console.log(`RTSP URLs found: ${results.rtsp.length > 0 ? results.rtsp.join(', ') : 'NONE'}`);
  console.log(`MJPEG URLs found: ${results.mjpeg.length > 0 ? results.mjpeg.join(', ') : 'NONE'}`);
  console.log(`PTZ capable: ${results.ptzCapable ? 'YES' : 'Unknown/No'}`);
  console.log(`HTTP endpoints responding: ${results.httpEndpoints.length}`);
  
  if (results.rtsp.length > 0) {
    console.log(`\n★ LIVE STREAM: Try FFmpeg with: ffmpeg -i "${results.rtsp[0]}" -c copy -f hls output.m3u8`);
  } else if (results.mjpeg.length > 0) {
    console.log(`\n★ LIVE STREAM: MJPEG available at: ${results.mjpeg[0]}`);
  } else {
    console.log(`\n⚠ No standard live stream found. Camera may only support recording playback.`);
  }
}

main().catch(console.error);
