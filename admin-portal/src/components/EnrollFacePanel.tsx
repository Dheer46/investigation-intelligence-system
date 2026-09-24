import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

// Captures face frames from this admin's browser and posts them to this
// same backend's /auth/officers/:id endpoints - works from any PC, any
// browser with a webcam. The backend forwards frames to biometric-service
// internally; this component never talks to it directly.
//
// The USB token is an opaque lookup key, not a bearer secret - the real
// security is the PIN + face check the gate does centrally. So it's written
// to the USB as plain JSON via the File System Access API (Chrome/Edge),
// no separate installed tool needed.
const FRAMES_TO_CAPTURE = 18;
const CAPTURE_INTERVAL_MS = 250;
const TOKEN_FILENAME = 'gov_token.json';

interface Props {
  officerId: string;
  officerLabel: string;
}

type Phase =
  | 'idle'
  | 'camera-error'
  | 'capturing'
  | 'submitting'
  | 'enrolled'
  | 'pairing'
  | 'done'
  | 'failed';

const supportsFsAccess = typeof (window as any).showDirectoryPicker === 'function';

export default function EnrollFacePanel({ officerId, officerLabel }: Props) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [framesCaptured, setFramesCaptured] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [tokenId, setTokenId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function captureFrame(): string | null {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  async function startEnrollment() {
    setMessage(null);

    if (pin.length < 4) {
      setPhase('failed');
      setMessage('PIN must be at least 4 characters.');
      return;
    }
    if (pin !== confirmPin) {
      setPhase('failed');
      setMessage('PINs do not match.');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
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
    await new Promise((r) => setTimeout(r, 500));

    for (let i = 0; i < FRAMES_TO_CAPTURE; i++) {
      const frame = captureFrame();
      if (frame) images.push(frame);
      setFramesCaptured(i + 1);
      await new Promise((r) => setTimeout(r, CAPTURE_INTERVAL_MS));
    }

    stream.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    setPhase('submitting');
    try {
      const res = await api.post(`/auth/officers/${officerId}/biometric`, { images, pin });
      setPhase('enrolled');
      setMessage(`Face + PIN enrolled (${res.data.framesUsed} usable frames).`);
    } catch (err: any) {
      setPhase('failed');
      setMessage(err?.response?.data?.message ?? 'Enrollment failed.');
    }
  }

  async function pairUsb() {
    setMessage(null);
    setPhase('pairing');
    try {
      const res = await api.post(`/auth/officers/${officerId}/usb-token`);
      const newTokenId: string = res.data.tokenId;
      setTokenId(newTokenId);

      if (supportsFsAccess) {
        const dirHandle = await (window as any).showDirectoryPicker({
          id: 'gov-usb-token',
          mode: 'readwrite',
        });
        const fileHandle = await dirHandle.getFileHandle(TOKEN_FILENAME, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify({ tokenId: newTokenId }));
        await writable.close();
        setPhase('done');
        setMessage(`Wrote ${TOKEN_FILENAME} to the selected drive. This USB is now paired to ${officerLabel}.`);
      } else {
        setPhase('done');
        setMessage(
          `Token generated: ${newTokenId}. Your browser can't write to the USB directly - ` +
            `create ${TOKEN_FILENAME} on the drive yourself with: {"tokenId":"${newTokenId}"}`,
        );
      }
    } catch (err: any) {
      setPhase('failed');
      if (err?.name === 'AbortError') {
        setMessage('USB folder selection was cancelled.');
      } else {
        setMessage(err?.response?.data?.message ?? 'Could not pair the USB token.');
      }
    }
  }

  return (
    <div className="rounded-lg border border-gov-700 bg-gov-900 p-6 space-y-4">
      <h2 className="font-serif text-lg text-paper">Step 2: Enroll Face, PIN &amp; USB</h2>
      <p className="text-xs text-slate-500">
        Works from this browser directly - no local software required. The
        officer should sit in front of this computer's camera now.
      </p>

      {(phase === 'idle' || phase === 'capturing' || phase === 'submitting' || phase === 'camera-error') && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">PIN</label>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                disabled={phase === 'capturing' || phase === 'submitting'}
                className="w-full rounded-md bg-gov-800 border border-gov-700 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-seal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                disabled={phase === 'capturing' || phase === 'submitting'}
                className="w-full rounded-md bg-gov-800 border border-gov-700 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-seal-500"
              />
            </div>
          </div>

          <div className="rounded-md overflow-hidden bg-black aspect-video max-w-sm border border-gov-700">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          </div>
          <canvas ref={canvasRef} className="hidden" />

          {phase === 'capturing' && (
            <p className="text-sm text-seal-400">Capturing frame {framesCaptured}/{FRAMES_TO_CAPTURE}…</p>
          )}
          {phase === 'submitting' && <p className="text-sm text-seal-400">Processing frames…</p>}

          <button
            onClick={startEnrollment}
            disabled={phase === 'capturing' || phase === 'submitting'}
            className="w-full rounded-md bg-seal-600 text-gov-950 text-sm font-semibold py-2.5 hover:bg-seal-500 disabled:opacity-50 transition-colors"
          >
            {phase === 'capturing' || phase === 'submitting' ? 'Working…' : 'Start Camera & Enroll'}
          </button>
        </>
      )}

      {(phase === 'enrolled' || phase === 'pairing') && (
        <>
          <p className="text-sm text-seal-400">{message}</p>
          <p className="text-xs text-slate-500">
            Now insert a USB drive for this officer and pair it.
            {!supportsFsAccess && ' Your browser will only show you the token to copy manually (Chrome/Edge can write it directly).'}
          </p>
          <button
            onClick={pairUsb}
            disabled={phase === 'pairing'}
            className="w-full rounded-md bg-seal-600 text-gov-950 text-sm font-semibold py-2.5 hover:bg-seal-500 disabled:opacity-50 transition-colors"
          >
            {phase === 'pairing' ? 'Pairing…' : supportsFsAccess ? 'Select USB Drive & Pair' : 'Generate Token'}
          </button>
        </>
      )}

      {phase === 'done' && (
        <div className="space-y-2">
          <p className="text-sm text-seal-400">{message}</p>
          {tokenId && <p className="text-xs text-slate-600">Token id: {tokenId}</p>}
        </div>
      )}

      {phase === 'failed' && message && <p className="text-sm text-crest-500">{message}</p>}
      {phase === 'camera-error' && message && <p className="text-sm text-crest-500">{message}</p>}
    </div>
  );
}
