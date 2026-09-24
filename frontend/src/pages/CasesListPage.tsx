import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { canAct, useAuthStore } from '../store/auth';
import type { Case } from '../types';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  UNDER_INVESTIGATION: 'Under investigation',
  CLOSED: 'Closed',
  ARCHIVED: 'Archived',
};

export default function CasesListPage() {
  const role = useAuthStore((s) => s.user?.role);
  const [cases, setCases] = useState<Case[]>([]);
  const [caseNumber, setCaseNumber] = useState('');
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get('/cases').then((res) => setCases(res.data));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await api.post('/cases', { caseNumber, title });
      setCaseNumber('');
      setTitle('');
      load();
    } catch {
      setError('Could not start this case — that case number may already be in use');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="font-serif text-2xl text-slate-100 mb-1">Cases</h1>
      <p className="text-sm text-slate-500 mb-6">Everything you're investigating, in one place.</p>

      {canAct(role) && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-ink-700 bg-ink-900 p-5 mb-8 grid gap-3 md:grid-cols-3"
        >
          <input
            placeholder="Case number (e.g. FIR-2026-0010)"
            value={caseNumber}
            onChange={(e) => setCaseNumber(e.target.value)}
            required
            className="rounded-md bg-ink-800 border border-ink-700 px-3 py-2.5 text-sm text-slate-100"
          />
          <input
            placeholder="What's this case about?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="rounded-md bg-ink-800 border border-ink-700 px-3 py-2.5 text-sm text-slate-100"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-trust-600 text-white text-sm font-medium py-2.5 hover:bg-trust-700 disabled:opacity-50"
          >
            {creating ? 'Starting…' : 'Start new case'}
          </button>
          {error && <p className="text-xs text-alert-high md:col-span-3">{error}</p>}
        </form>
      )}

      <div className="rounded-xl border border-ink-700 bg-ink-900 divide-y divide-ink-700">
        {cases.map((c) => (
          <Link
            key={c.id}
            to={`/cases/${c.id}`}
            className="flex items-center justify-between px-5 py-4 hover:bg-ink-800/60 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-slate-100">{c.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {c.caseNumber} · {STATUS_LABEL[c.status] ?? c.status}
              </p>
            </div>
            <div className="text-xs text-slate-500 text-right shrink-0">
              {c._count?.documents ?? 0} files · {c._count?.hypotheses ?? 0} findings
            </div>
          </Link>
        ))}
        {cases.length === 0 && (
          <p className="px-5 py-10 text-sm text-slate-500 text-center">
            No cases yet. {canAct(role) ? 'Start one above to begin uploading files.' : ''}
          </p>
        )}
      </div>
    </div>
  );
}
