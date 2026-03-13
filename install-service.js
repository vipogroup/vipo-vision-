/**
 * VIPO Vision — Windows Service Installer
 *
 * Installs the VIPO Vision server as a Windows service using node-windows.
 * The service will start automatically with Windows and restart on failure.
 *
 * Usage:
 *   node install-service.js          — Install the service
 *   node install-service.js remove   — Remove the service
 */

import { Service } from 'node-windows';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const svc = new Service({
  name: 'VIPO Vision',
  description: 'VIPO Vision — Camera Streaming Server (NVENC + HLS)',
  script: path.join(__dirname, 'server', 'src', 'index.js'),
  nodeOptions: [],
  workingDirectory: path.join(__dirname, 'server'),
  env: [
    { name: 'NODE_ENV', value: 'production' },
    { name: 'GATEWAY_PORT', value: '5055' },
  ],
});

const action = process.argv[2];

if (action === 'remove') {
  svc.on('uninstall', () => {
    console.log('✅ VIPO Vision service removed successfully.');
  });
  svc.on('error', (err) => {
    console.error('❌ Error removing service:', err);
  });
  svc.uninstall();
} else {
  svc.on('install', () => {
    console.log('✅ VIPO Vision service installed successfully.');
    console.log('   Starting service...');
    svc.start();
  });
  svc.on('start', () => {
    console.log('✅ VIPO Vision service is running!');
    console.log('   Open http://localhost:5055 in your browser.');
  });
  svc.on('alreadyinstalled', () => {
    console.log('ℹ️  Service already installed. Starting...');
    svc.start();
  });
  svc.on('error', (err) => {
    console.error('❌ Error installing service:', err);
  });
  svc.install();
}
