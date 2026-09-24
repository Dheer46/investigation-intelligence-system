import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('investigator@iis.local');
  const [password, setPassword] = useState('Investigator@123');
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
      setSession(res.data.accessToken, res.data.user);
      navigate('/');
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl border border-ink-700 bg-ink-900 p-7">
        <h1 className="font-serif text-xl text-slate-100 mb-1">Investigation Intelligence</h1>
        <p className="text-sm text-slate-500 mb-6">Sign in to continue</p>

        <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 rounded-md bg-ink-800 border border-ink-700 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-trust-500"
        />

        <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-5 rounded-md bg-ink-800 border border-ink-700 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-trust-500"
        />

        {error && <p className="text-sm text-alert-high mb-3">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-trust-600 text-white text-sm font-medium py-2.5 hover:bg-trust-700 disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-xs text-slate-600 mt-5">
          Demo accounts: investigator / supervisor / auditor / admin @iis.local
        </p>
        <a href="http://localhost:8500" className="block text-center text-xs text-trust-400 hover:underline mt-4">
          Officer? Use the secure face-authentication gate →
        </a>
      </form>
    </div>
  );
}
