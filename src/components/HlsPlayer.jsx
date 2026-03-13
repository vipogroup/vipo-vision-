import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

// [LOW-LATENCY TUNING] All values below tuned for minimum HLS latency
const HLS_CONFIG = {
  enableWorker: true,
  lowLatencyMode: true,                // [LOW-LATENCY] was: false — enables LL-HLS partial segment awareness
  liveSyncDurationCount: 1,            // [LOW-LATENCY] was: 3 — stay only 1 segment behind live edge (was 3)
  liveMaxLatencyDurationCount: 2,      // [LOW-LATENCY] was: 10 — catch up if >2 segments behind (was 10)
  liveDurationInfinity: true,
  maxBufferLength: 4,                  // [LOW-LATENCY] was: 15 — reduce prebuffer to 4s (was 15s)
  maxMaxBufferLength: 6,               // [LOW-LATENCY] was: 30 — hard ceiling 6s (was 30s)
  backBufferLength: 2,                 // [LOW-LATENCY] was: 15 — keep only 2s played data (was 15s)
  startLevel: -1,
  autoLevelCapping: -1,
  abrEwmaDefaultEstimate: 5000000,
  manifestLoadingMaxRetry: 10,
  manifestLoadingRetryDelay: 1000,     // [LOW-LATENCY] was: 2000 — faster manifest retry
  levelLoadingMaxRetry: 10,
  levelLoadingRetryDelay: 1000,        // [LOW-LATENCY] was: 2000 — faster level retry
  fragLoadingMaxRetry: 6,
};

export default function HlsPlayer({ hlsUrl, autoplay = true, muted = true }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsUrl) return;
    let destroyed = false;

    function createPlayer() {
      if (destroyed) return;
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

      const hls = new Hls(HLS_CONFIG);
      hlsRef.current = hls;

      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        retryCountRef.current = 0;
        if (autoplay) {
          video.play().catch(() => {});
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }
        // For network errors or other fatal errors: destroy and recreate
        if (retryCountRef.current < 15 && !destroyed) {
          retryCountRef.current++;
          const delay = Math.min(retryCountRef.current * 2000, 10000);
          setTimeout(() => createPlayer(), delay);
        }
      });
    }

    if (Hls.isSupported()) {
      createPlayer();
      return () => {
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
