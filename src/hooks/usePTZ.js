import { useState, useCallback, useRef } from 'react';
import { ptzService, zoomService, presetService } from '../services/ptzService';

export function usePTZ(cameraId, camera) {
  const [position, setPosition] = useState({ pan: 0, tilt: 0 });
  const [zoom, setZoom] = useState(camera?.zoomLevel || 1.0);
  const [speed, setSpeed] = useState(camera?.movementSpeed || 5);
  const [isMoving, setIsMoving] = useState(false);
  const [activeDirection, setActiveDirection] = useState(null);
  const [lastAction, setLastAction] = useState(null);
  const [error, setError] = useState(null);
  const moveInterval = useRef(null);

  const move = useCallback(
    async (direction) => {
      if (!camera?.ptzSupported) return;
      setActiveDirection(direction);
      setIsMoving(true);
      setLastAction({ type: 'move', direction, time: new Date() });

      try {
        const result = await ptzService.move(cameraId, direction, speed);
        if (result.success) {
          setError(null);
          setPosition(result.position);
          return;
        }
        setError(result.message || 'PTZ move failed');
      } catch (err) {
        setError(err?.message || 'PTZ move failed');
      }

      setIsMoving(false);
      setActiveDirection(null);
    },
    [cameraId, speed, camera?.ptzSupported]
  );

  const startContinuousMove = useCallback(
    (direction) => {
      if (!camera?.ptzSupported) return;
      move(direction);
      moveInterval.current = setInterval(() => move(direction), 300);
    },
    [move, camera?.ptzSupported]
  );

  const stopContinuousMove = useCallback(async () => {
    if (moveInterval.current) {
      clearInterval(moveInterval.current);
      moveInterval.current = null;
    }
    setActiveDirection(null);
    setIsMoving(false);

    try {
      const result = await ptzService.stop(cameraId);
      if (result?.success) setError(null);
      else setError(result?.message || 'PTZ stop failed');
    } catch (err) {
      setError(err?.message || 'PTZ stop failed');
    }
  }, [cameraId]);

  const stop = useCallback(async () => {
    await stopContinuousMove();
    setLastAction({ type: 'stop', time: new Date() });
  }, [stopContinuousMove]);

  const zoomIn = useCallback(async () => {
    if (!camera?.zoomSupported) return;

    try {
      const result = await zoomService.zoomIn(cameraId);
      if (result.success) {
        setError(null);
        setZoom(result.zoom);
        setLastAction({ type: 'zoomIn', zoom: result.zoom, time: new Date() });
        return;
      }
      setError(result.message || 'Zoom in failed');
    } catch (err) {
      setError(err?.message || 'Zoom in failed');
    }
  }, [cameraId, camera?.zoomSupported]);

  const zoomOut = useCallback(async () => {
    if (!camera?.zoomSupported) return;

    try {
      const result = await zoomService.zoomOut(cameraId);
      if (result.success) {
        setError(null);
        setZoom(result.zoom);
        setLastAction({ type: 'zoomOut', zoom: result.zoom, time: new Date() });
        return;
      }
      setError(result.message || 'Zoom out failed');
    } catch (err) {
      setError(err?.message || 'Zoom out failed');
    }
  }, [cameraId, camera?.zoomSupported]);

  const setZoomLevel = useCallback(
    async (level) => {
      if (!camera?.zoomSupported) return;

      try {
        const result = await zoomService.setZoom(cameraId, level);
        if (result.success) {
          setError(null);
          setZoom(result.zoom);
          return;
        }
        setError(result.message || 'Set zoom failed');
      } catch (err) {
        setError(err?.message || 'Set zoom failed');
      }
    },
    [cameraId, camera?.zoomSupported]
  );

  const changeSpeed = useCallback(
    async (newSpeed) => {
      setSpeed(newSpeed);
      await ptzService.setSpeed(cameraId, newSpeed);
    },
    [cameraId]
  );

  const goToPreset = useCallback(
    async (preset) => {
      setIsMoving(true);
      setLastAction({ type: 'preset', name: preset.name, time: new Date() });

      try {
        const result = await presetService.goToPreset(cameraId, preset);
        if (result.success) {
          setError(null);
          setPosition({ pan: result.position.pan, tilt: result.position.tilt });
          setZoom(result.position.zoom);
        } else {
          setError(result.message || 'Preset move failed');
        }
      } catch (err) {
        setError(err?.message || 'Preset move failed');
      }
      setIsMoving(false);
    },
    [cameraId]
  );

  const goHome = useCallback(async () => {
    setIsMoving(true);
    setLastAction({ type: 'home', time: new Date() });
    const homePreset = { name: 'Home', pan: 0, tilt: 0, zoom: 1.0 };

    try {
      const result = await presetService.goToPreset(cameraId, homePreset);
      if (result.success) {
        setError(null);
        setPosition({ pan: 0, tilt: 0 });
        setZoom(1.0);
      } else {
        setError(result.message || 'Home failed');
      }
    } catch (err) {
      setError(err?.message || 'Home failed');
    }
    setIsMoving(false);
  }, [cameraId]);

  const savePreset = useCallback(
    async (name) => {
      try {
        const result = await presetService.savePreset(cameraId, name);
        if (result.success) {
          setError(null);
          return result.preset;
        }
        setError(result.message || 'Save preset failed');
        return null;
      } catch (err) {
        setError(err?.message || 'Save preset failed');
        return null;
      }
    },
    [cameraId]
  );

  return {
    position,
    zoom,
    speed,
    isMoving,
    activeDirection,
    lastAction,
    error,
    move,
    startContinuousMove,
    stopContinuousMove,
    stop,
    zoomIn,
    zoomOut,
    setZoomLevel,
    changeSpeed,
    goToPreset,
    goHome,
    savePreset,
    maxZoom: camera?.maxZoom || 20,
    ptzSupported: camera?.ptzSupported || false,
    zoomSupported: camera?.zoomSupported || false,
  };
}
