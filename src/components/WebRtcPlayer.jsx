import { useEffect, useRef, useState, useCallback } from 'react';
import { MEDIAMTX_BASE } from '../config';

/**
 * WebRTC player using WHEP (WebRTC-HTTP Egress Protocol).
 * Connects to MediaMTX server for sub-second latency video playback.
 *
 * @param {string} streamId - Camera/stream ID (e.g. "cam-001")
 * @param {function} onError - Called when WebRTC fails (triggers HLS fallback)
 * @param {boolean} autoplay
 * @param {boolean} muted
 */
export default function WebRtcPlayer({ streamId, onError, autoplay = true, muted = true }) {
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const sessionUrlRef = useRef(null);
  const retryRef = useRef(0);
  const destroyedRef = useRef(false);
  const [Connected, setConnected] = useState(false);

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    // Tell MediaMTX to release the session
    if (sessionUrlRef.current) {
      fetch(sessionUrlRef.current, { method: 'DELETE' }).catch(() => {});
      sessionUrlRef.current = null;
    }
    setConnected(false);
  }, []);

  const connect = useCallback(async () => {
    if (destroyedRef.current) return;
    cleanup();

    const whepUrl = `${MEDIAMTX_BASE}/${streamId}/whep`;

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;

      // We only receive video
      pc.addTransceiver('video', { direction: 'recvonly' });

      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          setConnected(true);
          retryRef.current = 0;
          if (autoplay) {
            videoRef.current.play().catch(() => {});
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          if (!destroyedRef.current) {
            setConnected(false);
            // Retry a few times before giving up
            if (retryRef.current < 3) {
              retryRef.current++;
              setTimeout(() => connect(), 2000 * retryRef.current);
            } else {
              onError?.('WebRTC connection failed after retries');
            }
          }
        }
      };

      // Create SDP offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete (or timeout)
      await new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
          return;
        }
        const checkState = () => {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }
        };
        pc.addEventListener('icegatheringstatechange', checkState);
        // Timeout after 3s
        setTimeout(resolve, 3000);
      });

      // Send offer to MediaMTX WHEP endpoint
      const res = await fetch(whepUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription.sdp,
      });

      if (!res.ok) {
        throw new Error(`WHEP ${res.status}: ${res.statusText}`);
      }

      // MediaMTX returns SDP answer + session URL in Location header
      const answerSdp = await res.text();
      const location = res.headers.get('Location');
      if (location) {
        // Location can be relative or absolute
        sessionUrlRef.current = location.startsWith('http')
          ? location
          : `${MEDIAMTX_BASE}${location}`;
      }

      await pc.setRemoteDescription(new RTCSessionDescription({
        type: 'answer',
        sdp: answerSdp,
      }));

    } catch (err) {
      cleanup();
      if (!destroyedRef.current) {
        if (retryRef.current < 2) {
          retryRef.current++;
          setTimeout(() => connect(), 2000);
        } else {
          onError?.(err.message || 'WebRTC connection failed');
        }
      }
    }
  }, [streamId, autoplay, cleanup, onError]);

  useEffect(() => {
    if (!streamId) return;
    destroyedRef.current = false;
    retryRef.current = 0;

    // Small delay to allow MediaMTX to receive the RTSP stream first
    const timer = setTimeout(() => connect(), 1500);

    return () => {
      destroyedRef.current = true;
      clearTimeout(timer);
      cleanup();
    };
  }, [streamId, connect, cleanup]);

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
