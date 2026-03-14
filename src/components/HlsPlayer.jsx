import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

// [LOW-LATENCY TUNING] All values below tuned for minimum HLS latency
const HLS_CONFIG = {
  enableWorker: true,
  lowLatencyMode: true,
  liveSyncDurationCount: 2,            // [STABLE] stay 2 segments behind live edge (was 1 — too tight, caused 404s)
  liveMaxLatencyDurationCount: 5,      // [STABLE] catch up if >5 segments behind (was 2 — too aggressive)
  liveDurationInfinity: true,
  maxBufferLength: 10,                 // [STABLE] prebuffer up to 10s (was 4 — too small for copy mode)
  maxMaxBufferLength: 15,              // [STABLE] hard ceiling 15s (was 6)
  backBufferLength: 5,                 // [STABLE] keep 5s played data (was 2)
  startLevel: -1,
  autoLevelCapping: -1,
  abrEwmaDefaultEstimate: 5000000,
  manifestLoadingMaxRetry: 10,
  manifestLoadingRetryDelay: 1000,
  levelLoadingMaxRetry: 10,
  levelLoadingRetryDelay: 1000,
  fragLoadingMaxRetry: 10,             // [STABLE] was 6 — retry more before giving up
};

let _hlsInstanceCounter = 0;

export default function HlsPlayer({ hlsUrl, autoplay = true, muted = true, cameraId = '?' }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const retryCountRef = useRef(0);
  const hlsInstIdRef = useRef(++_hlsInstanceCounter);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsUrl) return;
    let destroyed = false;

    function createPlayer() {
      if (destroyed) return;
      if (hlsRef.current) {
        console.log(`[HLS ${cameraId}] Destroying old hls.js instance`);
        hlsRef.current.destroy(); hlsRef.current = null;
      }

      const hls = new Hls(HLS_CONFIG);
      hlsRef.current = hls;

      console.log(`[HLS ${cameraId}] Created hls.js #${hlsInstIdRef.current}, loading: ${hlsUrl}`);
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log(`[HLS ${cameraId}] MANIFEST_PARSED — playing (retries reset from ${retryCountRef.current})`);
        retryCountRef.current = 0;
        if (autoplay) {
          video.play().catch(() => {});
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        console.warn(`[HLS ${cameraId}] FATAL ERROR: type=${data.type}, details=${data.details}, retry=${retryCountRef.current}`);
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          console.log(`[HLS ${cameraId}] Recovering media error`);
          hls.recoverMediaError();
          return;
        }
        // Network or other fatal error — reload source instead of full destroy
        // This keeps the video element alive and avoids black screen gaps
        if (retryCountRef.current < 20 && !destroyed) {
          retryCountRef.current++;
          const delay = Math.min(1000 + retryCountRef.current * 500, 5000);
          console.log(`[HLS ${cameraId}] Reloading source in ${delay}ms (attempt ${retryCountRef.current})`);
          setTimeout(() => {
            if (destroyed || !hlsRef.current) return;
            try {
              hlsRef.current.stopLoad();
              hlsRef.current.loadSource(hlsUrl);
              hlsRef.current.startLoad(-1);
              console.log(`[HLS ${cameraId}] Source reloaded (attempt ${retryCountRef.current})`);
            } catch {
              // If reload fails, do full recreate as last resort
              console.log(`[HLS ${cameraId}] Reload failed, full recreate`);
              createPlayer();
            }
          }, delay);
        } else {
          console.error(`[HLS ${cameraId}] Gave up after ${retryCountRef.current} retries`);
        }
      });
    }

    if (Hls.isSupported()) {
      createPlayer();
      return () => {
        console.log(`[HLS ${cameraId}] useEffect CLEANUP — destroying player`);
        destroyed = true;
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl;
      if (autoplay) { video.play().catch(() => {}); }
      return () => { video.src = ''; };
    }
  }, [hlsUrl, autoplay]);

  return (
    <video
      ref={videoRef}
      autoPlay={autoplay}
      muted={muted}
      playsInline
      webkit-playsinline=""
      className="w-full h-full object-contain bg-black"
      style={{ minHeight: 0, imageRendering: 'crisp-edges', WebkitBackfaceVisibility: 'hidden', WebkitFontSmoothing: 'antialiased' }}
    />
  );
}
