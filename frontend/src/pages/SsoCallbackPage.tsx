import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

// Landing point for the standalone face-auth gate (see
// C:\Users\USER\Desktop\face detection\server.py + dashboard_session.py).
// That server only redirects here once it has independently verified PIN +
// secret + liveness + 1:N face match AND resolved the enrolled face to a
// real, active officer row in this same database - the token in the hash
// is exactly what /auth/login would have issued for that officer, so we
// just store it and go, the same as any other sign-in.
export default function SsoCallbackPage() {
  const [error, setError] = useState<string | null>(null);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const token = params.get('token');
    const userB64 = params.get('user');

    if (!token || !userB64) {
      setError('Missing session data from the secure access gate.');
      return;
    }

    try {
      const user = JSON.parse(atob(decodeURIComponent(userB64)));
      setSession(token, user);
      navigate('/', { replace: true });
    } catch {
      setError('Could not read the session handed off by the secure access gate.');
    }
  }, [setSession, navigate]);

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-sm text-alert-high mb-2">{error}</p>
            <a href="/login" className="text-sm text-trust-400 hover:underline">
              Back to sign in
            </a>
          </>
        ) : (
          <p className="text-sm text-slate-400">Opening dashboard…</p>
        )}
      </div>
    </div>
  );
}
