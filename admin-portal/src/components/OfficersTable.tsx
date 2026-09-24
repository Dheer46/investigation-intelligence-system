import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { roleLabel } from '../utils/readable';

interface Officer {
  id: string;
  email: string;
  fullName: string;
  role: string;
  badgeNumber: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function OfficersTable({ refreshKey }: { refreshKey: number }) {
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Officer[]>('/auth/users');
      setOfficers(res.data);
    } catch {
      setError('Could not load officer list.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function toggle(officer: Officer) {
    setBusyId(officer.id);
    try {
      await api.patch(`/auth/users/${officer.id}/active`, { isActive: !officer.isActive });
      setOfficers((prev) =>
        prev.map((o) => (o.id === officer.id ? { ...o, isActive: !o.isActive } : o)),
      );
    } catch {
      setError(`Could not update ${officer.email}.`);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(officer: Officer) {
    if (!window.confirm(`Delete ${officer.fullName} (${officer.email})? This cannot be undone.`)) {
      return;
    }
    setBusyId(officer.id);
    setDeleteError(null);
    try {
      await api.delete(`/auth/users/${officer.id}`);
      setOfficers((prev) => prev.filter((o) => o.id !== officer.id));
    } catch (err: any) {
      setDeleteError(err?.response?.data?.message ?? `Could not delete ${officer.email}.`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-lg border border-gov-700 bg-gov-900 p-6">
      <h2 className="font-serif text-lg text-paper mb-4">Registered Officers</h2>
      {error && <p className="text-sm text-crest-500 mb-3">{error}</p>}
      {deleteError && <p className="text-sm text-crest-500 mb-3">{deleteError}</p>}
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : officers.length === 0 ? (
        <p className="text-sm text-slate-500">No accounts yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-gov-700">
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Email</th>
                <th className="pb-2 pr-4 font-medium">Role</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {officers.map((o) => (
                <tr key={o.id} className="border-b border-gov-800 last:border-0">
                  <td className="py-2.5 pr-4 text-slate-200 whitespace-nowrap">{o.fullName}</td>
                  <td className="py-2.5 pr-4 text-slate-400 whitespace-nowrap">{o.email}</td>
                  <td className="py-2.5 pr-4 text-slate-400 whitespace-nowrap">{roleLabel(o.role)}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">
                    <span
                      className={`text-xs px-2 py-1 rounded-full border ${
                        o.isActive
                          ? 'bg-seal-500/10 text-seal-400 border-seal-500/30'
                          : 'bg-crest-500/10 text-crest-500 border-crest-500/30'
                      }`}
                    >
                      {o.isActive ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => toggle(o)}
                      disabled={busyId === o.id}
                      className="text-xs font-medium text-slate-400 hover:text-slate-200 disabled:opacity-50 mr-4"
                    >
                      {o.isActive ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => remove(o)}
                      disabled={busyId === o.id}
                      className="text-xs font-medium text-crest-500 hover:text-crest-500/80 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
