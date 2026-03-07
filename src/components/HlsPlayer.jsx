import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

const HLS_CONFIG = {
  enableWorker: true,
  lowLatencyMode: true,
  liveSyncDurationCount: 3,
  liveMaxLatencyDurationCount: 6,
  liveDurationInfinity: true,
  maxBufferLength: 4,
  maxMaxBufferLength: 8,
  manifestLoadingMaxRetry: 10,
  manifestLoadingRetryDelay: 2000,
  levelLoadingMaxRetry: 10,
  levelLoadingRetryDelay: 2000,
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
      style={{ minHeight: 0 }}
    />
  );
}
