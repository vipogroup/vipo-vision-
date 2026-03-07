/**
 * CloseLi Camera Probe Part 2 — deeper investigation
 * Focuses on: live stream from /tmp/lite_stream_raw_data, ports 12345/12346, PTZ CGI details
 */

import net from 'net';
import http from 'http';

const CAMERA_IP = process.argv[2] || '10.0.0.9';
const TELNET_PORT = 23;

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

function tcpReadBytes(ip, port, maxBytes = 4096, timeout = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const chunks = [];
    let totalLen = 0;
    socket.setTimeout(timeout);
    socket.on('data', (data) => {
      chunks.push(data);
      totalLen += data.length;
      if (totalLen >= maxBytes) { socket.destroy(); resolve(Buffer.concat(chunks)); }
    });
    socket.on('timeout', () => { socket.destroy(); resolve(chunks.length > 0 ? Buffer.concat(chunks) : null); });
    socket.on('error', () => { socket.destroy(); resolve(null); });
    socket.on('close', () => resolve(chunks.length > 0 ? Buffer.concat(chunks) : null));
    socket.connect(port, ip);
  });
}

function telnetCommand(ip, command, timeout = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let output = '';
    let done = false;
    const finish = () => { if (done) return; done = true; socket.destroy(); resolve(output); };
    socket.setTimeout(timeout);
    socket.on('timeout', finish);
    socket.on('error', () => { done = true; socket.destroy(); resolve(null); });
    socket.on('close', finish);
    socket.on('data', (data) => { output += data.toString(); });
    socket.connect(TELNET_PORT, ip, () => {
      setTimeout(() => {
        socket.write('root\n');
        setTimeout(() => {
          socket.write('\n');
          setTimeout(() => {
            socket.write(command + '\n');
            setTimeout(finish, 3000);
          }, 1000);
        }, 500);
      }, 1000);
    });
  });
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  CloseLi Deep Probe — Live Stream & PTZ     ║');
  console.log('╚══════════════════════════════════════════════╝');

  // 1. Check what's in /tmp/lite_stream_raw_data
  console.log('\n═══ 1. Live Stream Data Pipes ═══');
  const lsStream = await telnetCommand(CAMERA_IP, 'ls -la /tmp/lite_stream_raw_data/ && ls -la /tmp/lite_stream_raw_data_four/ && ls -la /tmp/lite_stream_raw_data_qvga/ && ls -la /tmp/lite_stream_raw_data_three/');
  if (lsStream) {
    const lines = lsStream.split('\n').filter(l => l.trim().length > 3 && !l.includes('root@') && !l.includes('ls -la'));
    lines.forEach(l => console.log('  ' + l.trim()));
  }

  // 2. Check the t23prj process
  console.log('\n═══ 2. t23prj Process Details ═══');
  const t23info = await telnetCommand(CAMERA_IP, 'ps | grep t23 && cat /proc/$(pidof t23prj)/cmdline 2>/dev/null | tr "\\0" " "');
  if (t23info) {
    const lines = t23info.split('\n').filter(l => l.includes('t23') && !l.includes('grep'));
    lines.forEach(l => console.log('  ' + l.trim()));
  }

  // 3. Probe ports 12345 and 12346 (raw TCP)
  console.log('\n═══ 3. Ports 12345/12346 Raw TCP Probe ═══');
  for (const port of [12345, 12346]) {
    console.log(`  Probing port ${port}...`);
    const data = await tcpReadBytes(CAMERA_IP, port, 2048, 3000);
    if (data) {
      console.log(`  Got ${data.length} bytes from port ${port}`);
      // Check for H264 NAL start code (0x00000001)
      const hex = data.slice(0, 64).toString('hex');
      console.log(`  First 64 bytes (hex): ${hex}`);
      if (hex.includes('00000001') || hex.includes('0001')) {
        console.log(`  ★ H264 NAL start code detected! This is a raw H264 stream!`);
      }
      // Check for JPEG SOI (FFD8)
      if (hex.startsWith('ffd8')) {
        console.log(`  ★ JPEG SOI marker detected! This is a JPEG/MJPEG stream!`);
      }
      // Check for FLV
      if (data.slice(0, 3).toString() === 'FLV') {
        console.log(`  ★ FLV header detected!`);
      }
      // Check if it's text/JSON
      try {
        const text = data.toString('utf8').slice(0, 200);
        if (text.match(/^[\x20-\x7E\r\n\t]/)) {
          console.log(`  Text content: ${text.slice(0, 200)}`);
        }
      } catch {}
    } else {
      console.log(`  No data received from port ${port} (might need request first)`);
    }
  }

  // 4. Try HTTP on ports 12345/12346
  console.log('\n═══ 4. HTTP Probe on Ports 12345/12346 ═══');
  for (const port of [12345, 12346]) {
    for (const path of ['/', '/stream', '/video', '/live', '/snapshot']) {
      const resp = await httpGet(CAMERA_IP, port, path, 2000);
      if (resp) {
        console.log(`  [${resp.status}] :${port}${path} — CT: ${resp.headers['content-type'] || 'N/A'} — Body: ${resp.body.slice(0, 200)}`);
      }
    }
  }

  // 5. PTZ CGI detailed check
  console.log('\n═══ 5. PTZ Motor Control Details ═══');
  const ptzEndpoints = [
    '/cgi-bin/hi3510/param.cgi?cmd=getmotorattr',
    '/cgi-bin/hi3510/param.cgi?cmd=getserverinfo',
    '/cgi-bin/hi3510/param.cgi?cmd=getvideoattr',
    '/cgi-bin/hi3510/param.cgi?cmd=getvencattr',
    '/cgi-bin/hi3510/param.cgi?cmd=getaudioattr',
    '/cgi-bin/hi3510/param.cgi?cmd=getnetattr',
    '/cgi-bin/hi3510/param.cgi?cmd=getwirelessattr',
    '/cgi-bin/hi3510/param.cgi?cmd=getimageattr',
    '/cgi-bin/hi3510/param.cgi?cmd=getinfrared',
    '/cgi-bin/hi3510/param.cgi?cmd=getmdattr',
    '/cgi-bin/hi3510/param.cgi?cmd=getrtspattr',
    '/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=up&-speed=5',
    '/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=stop',
    '/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=left&-speed=5',
    '/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=right&-speed=5',
    '/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=down&-speed=5',
    '/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=home',
    '/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=zoomin',
    '/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=zoomout',
    // Step mode (move fixed amount)
    '/cgi-bin/hi3510/ptzctrl.cgi?-step=1&-act=up&-speed=5',
    '/cgi-bin/hi3510/ptzctrl.cgi?-step=1&-act=left&-speed=5',
  ];

  for (const ep of ptzEndpoints) {
    const resp = await httpGet(CAMERA_IP, 8080, ep, 3000);
    if (resp && resp.status === 200) {
      const body = resp.body.replace(/\s+/g, ' ').trim();
      console.log(`  ✓ ${ep.split('?')[1] || ep}`);
      if (body.length > 0 && body.length < 500) {
        console.log(`    Response: ${body}`);
      }
    } else if (resp) {
      console.log(`  ✗ [${resp.status}] ${ep.split('?')[1] || ep}`);
    }
  }

  // 6. Check for MJPEG/snapshot CGI
  console.log('\n═══ 6. Video/Snapshot Endpoints ═══');
  const videoEndpoints = [
    '/cgi-bin/hi3510/snap.cgi',
    '/cgi-bin/hi3510/snap.cgi?-chn=0',
    '/cgi-bin/hi3510/snap.cgi?-chn=1',
    '/cgi-bin/hi3510/snap.cgi?-chn=2',
    '/cgi-bin/hi3510/snap.cgi?-chn=3',
    '/cgi-bin/hi3510/mjpegstream.cgi',
    '/cgi-bin/hi3510/mjpegstream.cgi?-chn=0',
    '/tmpfs/snap.jpg',
    '/tmpfs/auto.jpg',
    '/tmpfs/snap_00.jpg',
    '/tmpfs/snap_01.jpg',
    '/snap.cgi',
    '/image.jpg',
    '/cgi-bin/snapshot.cgi',
    '/webcapture.jpg?command=snap&channel=0',
    '/cgi-bin/hi3510/param.cgi?cmd=getrtspattr',
  ];

  for (const ep of videoEndpoints) {
    const resp = await httpGet(CAMERA_IP, 8080, ep, 3000);
    if (resp && resp.status < 500) {
      const ct = resp.headers['content-type'] || 'N/A';
      const isImage = ct.includes('image') || ct.includes('jpeg') || ct.includes('mjpeg') || ct.includes('multipart');
      console.log(`  [${resp.status}] ${ep} — ${ct} ${isImage ? '★ IMAGE/VIDEO!' : ''}`);
      if (!isImage && resp.body.length < 500) {
        console.log(`    Body: ${resp.body.replace(/\s+/g, ' ').trim()}`);
      } else if (isImage) {
        console.log(`    Data size: ${resp.body.length} bytes`);
      }
    }
  }

  // 7. Try to find RTSP config
  console.log('\n═══ 7. RTSP Configuration ═══');
  const rtspConf = await telnetCommand(CAMERA_IP, 'cat /tmp/rtsp*.conf /etc/rtsp*.conf /usr/share/config/rtsp* 2>/dev/null; grep -r "rtsp" /tmp/*.conf /etc/*.conf 2>/dev/null | head -10');
  if (rtspConf) {
    const lines = rtspConf.split('\n').filter(l => l.trim().length > 3 && !l.includes('root@') && !l.includes('grep'));
    if (lines.length > 0) {
      lines.forEach(l => console.log('  ' + l.trim()));
    }
  }

  // 8. Check if we can start an RTSP server
  console.log('\n═══ 8. Search for RTSP/Streaming Binary ═══');
  const findBins = await telnetCommand(CAMERA_IP, 'find / -name "rtspd" -o -name "v4l2rtspserver" -o -name "live555*" -o -name "mediamtx" 2>/dev/null; which ffmpeg 2>/dev/null; which avconv 2>/dev/null');
  if (findBins) {
    const lines = findBins.split('\n').filter(l => l.includes('/') && !l.includes('root@') && !l.includes('find '));
    if (lines.length > 0) {
      lines.forEach(l => console.log('  ' + l.trim()));
    } else {
      console.log('  No RTSP/streaming binaries found on camera');
    }
  }

  console.log('\n═══ DONE ═══');
}

main().catch(console.error);
