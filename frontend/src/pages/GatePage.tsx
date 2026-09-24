import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

// The USB/PIN/face checkpoint - reachable from ANY workstation's browser
// (not tied to one machine's local files, see biometric-service +
// AuthService.verifyGateAuth). A local kiosk watcher (small script that
// detects the paired USB being inserted, unrelated to this React app) opens
// this exact page with ?token=<tokenId> from the USB's gov_token.json; it
// also works opened by hand for testing, prompting for the token instead.
const FRAMES_TO_CAPTURE = 5;
const CAPTURE_INTERVAL_MS = 300;
// Some webcams (especially external/USB ones, or a browser's first-ever
// grant to a device) take well over a second to actually start delivering
// frames after getUserMedia() resolves. Capturing on a fixed schedule
// regardless of that meant every frame came back null on slow hardware -
// the loop still "completed", just with an empty images array, so the
// backend's "images must contain at least 5 elements" was the only signal
// something was wrong. Retry until we actually have real frames instead.
const CAPTURE_TIMEOUT_MS = 15000;
// Where to hand the session off to after a successful gate check, instead
// of landing on this app's own dashboard - same #token=...&user=... format
// SsoCallbackPage.tsx already reads on the way IN from the standalone
// face-detection gate, so the receiving app just needs its own copy of
// that same small handler. Configurable via GATE_HANDOFF_URL (see
// .env.example) because "localhost" here would resolve on whichever PC's
// browser loads this page, not on the machine hosting this stack - on a LAN
// demo it needs to be that machine's actual LAN IP.
const HANDOFF_URL = import.meta.env.VITE_GATE_HANDOFF_URL || 'http://localhost:3001/sso-callback';

type Phase = 'enter-token' | 'ready' | 'camera-error' | 'capturing' | 'verifying' | 'denied' | 'granted';

export default function GatePage() {
  const [searchParams] = useSearchParams();
  const [tokenId, setTokenId] = useState(searchParams.get('token') ?? '');
  const [pin, setPin] = useState('');
  const [phase, setPhase] = useState<Phase>(searchParams.get('token') ? 'ready' : 'enter-token');
  const [message, setMessage] = useState<string | null>(null);
  const [framesCaptured, setFramesCaptured] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function captureFrame(): string | null {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  async function startVerification() {
    setMessage(null);
    if (!tokenId) {
      setMessage('No USB token detected.');
      return;
    }
    if (!pin) {
      setMessage('Enter your PIN.');
      return;
    }

    let stream: MediaStream;
    try {
      // facingMode: 'user' - without this, mobile browsers often default to
      // the REAR camera, which (pointed away from the officer's face) is
      // exactly what produced a pitch-black, unusable feed here.
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
    } catch {
      setPhase('camera-error');
      setMessage('Could not access the camera. Check browser permissions.');
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    setPhase('capturing');
    setFramesCaptured(0);

    const images: string[] = [];
    const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
    // Retry capture until we actually have FRAMES_TO_CAPTURE real frames,
    // rather than looping a fixed number of times and hoping the camera
    // was ready by then - see CAPTURE_TIMEOUT_MS above.
    while (images.length < FRAMES_TO_CAPTURE && Date.now() < deadline) {
      const frame = captureFrame();
      if (frame) {
        images.push(frame);
        setFramesCaptured(images.length);
      }
      await new Promise((r) => setTimeout(r, CAPTURE_INTERVAL_MS));
    }

    stream.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (images.length < FRAMES_TO_CAPTURE) {
      setPhase('camera-error');
      setMessage('Camera never produced a usable video feed. Try again, or check the camera in another app.');
      return;
    }

    setPhase('verifying');
    try {
      const res = await api.post('/auth/gate/verify', { tokenId, pin, images });
      if (res.data.ok) {
        setPhase('granted');
        setSession(res.data.accessToken, res.data.user);
        const userB64 = encodeURIComponent(btoa(JSON.stringify(res.data.user)));
        setTimeout(() => {
          window.location.href = `${HANDOFF_URL}#token=${res.data.accessToken}&user=${userB64}`;
        }, 800);
      } else {
        setPhase('denied');
        setMessage(res.data.reason ?? 'Access denied.');
      }
    } catch (err: any) {
      setPhase('denied');
      setMessage(err?.response?.data?.message ?? 'Verification failed.');
    }
  }

  function retry() {
    setPin('');
    setMessage(null);
    setPhase('ready');
  }

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-serif text-xl text-slate-100 mb-1">Secure Access Gate</h1>
        <p className="text-xs text-slate-500 mb-6">Investigation Intelligence System</p>

        <div className="rounded-xl border border-ink-700 bg-ink-900 p-7">
          {phase === 'enter-token' && (
            <>
              <p className="text-sm text-slate-400 mb-4">
                No USB token detected. If you're testing manually, paste the token id below.
              </p>
              <input
                value={tokenId}
                onChange={(e) => setTokenId(e.target.value)}
                placeholder="GOV-XXXXXXXX"
                className="w-full mb-4 rounded-md bg-ink-800 border border-ink-700 px-3 py-2.5 text-sm text-slate-100 text-center focus:outline-none focus:border-trust-500"
              />
              <button
                onClick={() => tokenId && setPhase('ready')}
                className="w-full rounded-md bg-trust-600 text-white text-sm font-medium py-2.5 hover:bg-trust-700"
              >
                Continue
              </button>
            </>
          )}

          {(phase === 'ready' || phase === 'camera-error') && (
            <>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">PIN</label>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full mb-4 rounded-md bg-ink-800 border border-ink-700 px-3 py-2.5 text-sm text-slate-100 text-center focus:outline-none focus:border-trust-500"
              />
              {message && <p className="text-sm text-alert-high mb-3">{message}</p>}
              <button
                onClick={startVerification}
                className="w-full rounded-md bg-trust-600 text-white text-sm font-medium py-2.5 hover:bg-trust-700"
              >
                Verify Face &amp; PIN
              </button>
            </>
          )}

          {/* Always mounted (not just during 'capturing') so videoRef is
              already attached to a real <video> element by the time
              startVerification() sets stream.srcObject on it - otherwise
              that assignment lands on a null ref, since 'capturing' hasn't
              been set yet at that point, and the element this phase later
              mounts starts with no source at all (permanently black,
              0x0 frames, no matter how long the capture loop waits). */}
          <div className={`rounded-lg overflow-hidden bg-black aspect-video mb-4 ${phase === 'capturing' ? '' : 'hidden'}`}>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          </div>
          {phase === 'capturing' && (
            <p className="text-sm text-trust-400">Capturing {framesCaptured}/{FRAMES_TO_CAPTURE}…</p>
          )}

          {phase === 'verifying' && <p className="text-sm text-trust-400">Verifying…</p>}

          {phase === 'granted' && (
            <p className="text-sm text-trust-400 font-medium">ACCESS GRANTED — opening dashboard…</p>
          )}

          {phase === 'denied' && (
            <>
              <p className="text-sm text-alert-high mb-4">{message ?? 'Access denied.'}</p>
              <button
                onClick={retry}
                className="w-full rounded-md bg-ink-700 text-slate-200 text-sm font-medium py-2.5 hover:bg-ink-600"
              >
                Try again
              </button>
            </>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>
    </div>
  );
}
