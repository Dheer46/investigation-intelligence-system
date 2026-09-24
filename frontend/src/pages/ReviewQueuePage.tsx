import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { canAct, useAuthStore } from '../store/auth';
import ConfidenceBadge from '../components/ConfidenceBadge';
import type { Case, ReviewCandidate } from '../types';

const TYPE_LABEL: Record<string, string> = {
  PERSON: 'person',
  PHONE: 'phone number',
  VEHICLE: 'vehicle',
  LOCATION: 'location',
  ORGANIZATION: 'organization',
  BANK_ACCOUNT: 'bank account',
};

export default function ReviewQueuePage() {
  const role = useAuthStore((s) => s.user?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const caseFilter = searchParams.get('caseId') ?? '';
  const [cases, setCases] = useState<Case[]>([]);
  const [candidates, setCandidates] = useState<ReviewCandidate[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    const params: Record<string, string> = { status: 'PENDING' };
    if (caseFilter) params.caseId = caseFilter;
    api.get('/review-queue', { params }).then((res) => setCandidates(res.data));
  }

  useEffect(() => {
    api.get('/cases').then((res) => setCases(res.data));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [caseFilter]);

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED') {
    setBusyId(id);
    try {
      await api.post(`/review-queue/${id}/decision`, { decision });
      load();
    } finally {
      setBusyId(null);
    }
  }

  // Grouped even when "all cases" is selected - a flat list interleaving
  // matches from every open case (including old test/demo cases) reads as
  // one jumbled queue instead of one per investigation.
  const groups = useMemo(() => {
    const byCase = new Map<string, { case: ReviewCandidate['case']; items: ReviewCandidate[] }>();
    for (const c of candidates) {
      const group = byCase.get(c.case.id) ?? { case: c.case, items: [] };
      group.items.push(c);
      byCase.set(c.case.id, group);
    }
    return Array.from(byCase.values());
  }, [candidates]);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="font-serif text-2xl text-slate-100">Possible Matches</h1>
        <select
          value={caseFilter}
          onChange={(e) => setSearchParams(e.target.value ? { caseId: e.target.value } : {})}
          className="rounded-md bg-ink-800 border border-ink-700 px-3 py-1.5 text-sm text-slate-200"
        >
          <option value="">All cases</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        These records look like they might be the same person, number, or account — confirm or dismiss
        each one so the network stays accurate.
      </p>

      {groups.length === 0 && (
        <div className="rounded-xl border border-ink-700 bg-ink-900">
          <p className="px-5 py-8 text-sm text-slate-500">Nothing waiting for review right now.</p>
        </div>
      )}

      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.case.id}>
            {!caseFilter && (
              <h2 className="text-sm font-medium text-slate-300 mb-2">
                {group.case.title} <span className="text-slate-600 font-normal">({group.items.length})</span>
              </h2>
            )}
            <div className="rounded-xl border border-ink-700 bg-ink-900 divide-y divide-ink-700">
              {group.items.map((c) => (
                <div key={c.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-100">{c.canonicalName}</p>
                      <ConfidenceBadge score={c.matchScore} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Mentioned {c.memberEntityIds.length} times as the same {TYPE_LABEL[c.entityType] ?? 'entity'}
                      {caseFilter ? '' : ` · ${c.case.title}`}
                    </p>
                  </div>
                  {canAct(role) && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        disabled={busyId === c.id}
                        onClick={() => decide(c.id, 'APPROVED')}
                        className="rounded-md bg-alert-low/15 text-alert-low border border-alert-low/30 px-4 py-1.5 text-sm font-medium hover:bg-alert-low/25 disabled:opacity-50"
                      >
                        Yes, same one
                      </button>
                      <button
                        disabled={busyId === c.id}
                        onClick={() => decide(c.id, 'REJECTED')}
                        className="rounded-md bg-alert-high/15 text-alert-high border border-alert-high/30 px-4 py-1.5 text-sm font-medium hover:bg-alert-high/25 disabled:opacity-50"
                      >
                        No, different
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
