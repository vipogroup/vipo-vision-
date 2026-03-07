/**
 * Sanitize sensitive data from log output.
 * Never log raw passwords or full RTSP URLs with credentials.
 */

export function sanitizeUrl(url) {
  if (!url) return '[empty]';
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    if (u.username) u.username = u.username.substring(0, 2) + '***';
    return u.toString();
  } catch {
    return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
  }
}

export function sanitizeCamera(cam) {
  if (!cam) return cam;
  const copy = { ...cam };
  if (copy.password) copy.password = '***';
  if (copy.rtspUrl) copy.rtspUrl = sanitizeUrl(copy.rtspUrl);
  return copy;
}

export function log(level, msg, data) {
  const ts = new Date().toISOString().substring(11, 23);
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  if (data !== undefined) {
    console.log(prefix, msg, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.log(prefix, msg);
  }
}
