import { useContext } from 'react';
import { TelemetryContext } from '../context/TelemetryContextInstance.js';

export function useTelemetry(cameraId) {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error('useTelemetry must be used within a TelemetryProvider');
  }
  if (cameraId) {
    return context.getTelemetry(cameraId) || null;
  }
  return context.telemetry;
}
