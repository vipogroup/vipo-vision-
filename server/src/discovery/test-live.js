/**
 * Quick test of the live stream proxy
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { startLiveStream } from '../streaming/liveStreamProxy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hlsDir = path.join(__dirname, '..', '..', 'hls');

console.log('Starting live stream test...');
console.log('HLS output dir:', hlsDir);

const stream = startLiveStream({
  cameraIp: '10.0.0.9',
  streamPort: 12345,
  hlsOutputDir: hlsDir,
  streamId: 'live-cam001',
  fps: 25,
});

// Monitor status
const interval = setInterval(() => {
  console.log(`Status: ${stream.status} | Frames: ${stream.frameCount} | Error: ${stream.error || 'none'}`);
  if (stream.status === 'error' || stream.status === 'stopped') {
    clearInterval(interval);
    process.exit(1);
  }
}, 2000);

// Stop after 30 seconds
setTimeout(() => {
  console.log('Stopping after 30s test...');
  stream.stop();
  clearInterval(interval);
  process.exit(0);
}, 30000);
