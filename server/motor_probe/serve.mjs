// Simple HTTP server to serve motor_probe binary to camera
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8888;

const server = http.createServer((req, res) => {
  const filePath = path.join(__dirname, 'motor_probe');
  if (req.url === '/motor_probe' || req.url === '/') {
    try {
      const data = fs.readFileSync(filePath);
      console.log(`[${new Date().toISOString()}] Serving motor_probe (${data.length} bytes) to ${req.socket.remoteAddress}`);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': data.length });
      res.end(data);
    } catch (e) {
      res.writeHead(404);
      res.end('File not found');
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP server listening on 0.0.0.0:${PORT}`);
  console.log(`Camera can download: wget http://YOUR_PC_IP:${PORT}/motor_probe`);
});
