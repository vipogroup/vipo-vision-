import { useState, useEffect, useCallback, useRef } from 'react';
import { useCameraStore } from '../stores/cameraStore';
import { TelemetryContext } from './TelemetryContextInstance.js';

function generateTelemetry(camera) {
  const isOnline = camera.status !== 'offline';
  const baseRtt = isOnline ? Math.floor(Math.random() * 25 + 8) : 0;
  const jitter = isOnline ? Math.floor(Math.random() * 5) : 0;

  return {
    cameraId: camera.id,
    status: camera.status,
    rttMs: baseRtt,
    jitter,
    fps: isOnline ? camera.fps - Math.floor(Math.random() * 3) : 0,
    bitrate: isOnline ? Math.floor(Math.random() * 2000 + 4000) : 0,
    packetLoss: isOnline ? parseFloat((Math.random() * 0.5).toFixed(2)) : 0,
    signalStrength: isOnline ? Math.floor(Math.random() * 15 + 85) : 0,
    lastSeen: isOnline ? new Date().toISOString() : camera.lastMotion,
    uptime: camera.uptime,
    connectionQuality: isOnline
      ? baseRtt < 15
        ? 'excellent'
        : baseRtt < 30
        ? 'good'
        : 'fair'
      : 'offline',
  };
}

export function TelemetryProvider({ children }) {
  const { cameras } = useCameraStore();
  const [telemetry, setTelemetry] = useState(() => ({}));

  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTelemetry((prev) => {
        const next = { ...prev };
        for (const cam of cameras) {
          next[cam.id] = generateTelemetry(cam);
        }
        return next;
      });
    }, 2000);

    return () => clearInterval(intervalRef.current);
  }, [cameras]);

  const getTelemetry = useCallback(
    (cameraId) => telemetry[cameraId] || null,
    [telemetry]
  );

  return (
    <TelemetryContext.Provider value={{ telemetry, getTelemetry }}>
      {children}
    </TelemetryContext.Provider>
  );
}
