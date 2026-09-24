import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import Crest from '../components/Crest';

// Admin-only by design: the backend already restricts every endpoint this
// portal calls to ADMINISTRATOR (see auth.controller.ts's @Roles guards), so
// a non-admin who logs in here correctly authenticates but is turned away
// immediately rather than shown a portal full of buttons that would 403.
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      if (res.data.user.role !== 'ADMINISTRATOR') {
        setError('This portal is restricted to administrators.');
        return;
      }
      setSession(res.data.accessToken, res.data.user);
      navigate('/');
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <Crest className="w-16 h-16 mb-3" />
          <h1 className="font-serif text-xl text-paper text-center">Officer Registration Portal</h1>
          <p className="text-xs text-slate-500 tracking-wide uppercase mt-1">Administrator Access Only</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-gov-700 bg-gov-900 p-7 shadow-xl">
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mb-4 rounded-md bg-gov-800 border border-gov-700 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-seal-500"
          />

          <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mb-5 rounded-md bg-gov-800 border border-gov-700 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-seal-500"
          />

          {error && <p className="text-sm text-crest-500 mb-3">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-seal-600 text-gov-950 text-sm font-semibold py-2.5 hover:bg-seal-500 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-xs text-slate-600 text-center mt-5">
          For officer authentication, use the USB gate at the workstation, not this portal.
        </p>
      </div>
    </div>
  );
}
