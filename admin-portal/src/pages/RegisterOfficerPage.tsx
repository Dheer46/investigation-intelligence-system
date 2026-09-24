import { FormEvent, useState } from 'react';
import { api } from '../api/client';
import EnrollFacePanel from '../components/EnrollFacePanel';
import OfficersTable from '../components/OfficersTable';

const ROLES = ['INVESTIGATOR', 'SUPERVISOR', 'AUDITOR', 'ADMINISTRATOR'] as const;

export default function RegisterOfficerPage() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('INVESTIGATOR');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [officersRefreshKey, setOfficersRefreshKey] = useState(0);

  const [justCreated, setJustCreated] = useState<{ id: string; email: string; fullName: string } | null>(
    null,
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        email,
        password,
        fullName,
        role,
        ...(badgeNumber ? { badgeNumber } : {}),
      });
      setSuccess(`Account created for ${email}.`);
      setJustCreated({ id: res.data.user.id, email, fullName });
      setOfficersRefreshKey((k) => k + 1);
      setEmail('');
      setFullName('');
      setPassword('');
      setBadgeNumber('');
      setRole('INVESTIGATOR');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not create the account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <div className="max-w-lg">
        <p className="text-xs text-seal-500 uppercase tracking-widest mb-1">Officer Provisioning</p>
        <h1 className="font-serif text-2xl text-paper mb-1">Register a New Officer</h1>
        <p className="text-sm text-slate-500">
          Step 1 creates the account. Step 2 enrolls their face, PIN, and
          pairs their personal USB for gate access.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg rounded-lg border border-gov-700 bg-gov-900 p-6 space-y-4">
        <h2 className="font-serif text-lg text-paper">Step 1: Create Account</h2>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Full Name</label>
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-md bg-gov-800 border border-gov-700 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-seal-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="aditya@iis.local"
            className="w-full rounded-md bg-gov-800 border border-gov-700 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-seal-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Temporary Password</label>
          <input
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md bg-gov-800 border border-gov-700 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-seal-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
            className="w-full rounded-md bg-gov-800 border border-gov-700 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-seal-500"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0) + r.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Badge Number (optional)</label>
          <input
            value={badgeNumber}
            onChange={(e) => setBadgeNumber(e.target.value)}
            className="w-full rounded-md bg-gov-800 border border-gov-700 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-seal-500"
          />
        </div>

        {error && <p className="text-sm text-crest-500">{error}</p>}
        {success && <p className="text-sm text-seal-400">{success}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-seal-600 text-gov-950 text-sm font-semibold py-2.5 hover:bg-seal-500 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Creating…' : 'Create Account'}
        </button>
      </form>

      {justCreated && (
        <div className="max-w-lg">
          <EnrollFacePanel
            key={justCreated.id}
            officerId={justCreated.id}
            officerLabel={`${justCreated.fullName} (${justCreated.email})`}
          />
        </div>
      )}

      <OfficersTable refreshKey={officersRefreshKey} />
    </div>
  );
}
