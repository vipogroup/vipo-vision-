/**
 * VIPO Vision — Adapter Registry
 *
 * Central factory that returns the correct adapter for a camera
 * based on its type. Currently returns mockAdapter for all cameras.
 * Swap in real adapters when backend integration is ready.
 */

import { createMockAdapter } from './mockAdapter';
// import { createOnvifAdapter } from './onvifAdapter.stub';
// import { createHttpCgiAdapter } from './httpCgiAdapter.stub';

const adapterCache = new Map();

export function getAdapter(camera) {
  if (!camera) return createMockAdapter({});

  const key = camera.id;
  if (adapterCache.has(key)) return adapterCache.get(key);

  let adapter;

  switch (camera.type) {
    // When real adapters are ready, uncomment:
    // case 'ONVIF':
    //   adapter = createOnvifAdapter(camera);
    //   break;
    // case 'RTSP':
    //   adapter = createHttpCgiAdapter(camera);
    //   break;
    default:
      adapter = createMockAdapter(camera);
      break;
  }

  adapterCache.set(key, adapter);
  return adapter;
}

export function clearAdapterCache() {
  adapterCache.clear();
}

export { createMockAdapter } from './mockAdapter';
export { createOnvifAdapter } from './onvifAdapter.stub';
export { createHttpCgiAdapter } from './httpCgiAdapter.stub';
