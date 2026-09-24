import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { humanizeLocationRef, SOURCE_TYPE_LABEL } from '../utils/readable';
import type { EvidenceMention } from '../types';

const TYPE_LABEL: Record<string, string> = {
  PERSON: 'Person',
  PHONE: 'Phone number',
  VEHICLE: 'Vehicle',
  LOCATION: 'Location',
  ORGANIZATION: 'Organization',
  BANK_ACCOUNT: 'Bank account',
  DATE: 'Date',
  EVENT: 'Event',
};

interface Props {
  nodeId: string;
  entityType: string;
  label: string;
  onClose: () => void;
}

export default function EntityDetailPanel({ nodeId, entityType, label, onClose }: Props) {
  const [mentions, setMentions] = useState<EvidenceMention[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMentions(null);
    setError(null);
    api
      .get(`/entities/${nodeId}/evidence`)
      .then((res) => setMentions(res.data))
      .catch(() => setError('Could not load evidence for this entity'));
  }, [nodeId]);

  return (
    <div className="w-96 shrink-0 border-l border-ink-700 bg-ink-900 h-full overflow-y-auto">
      <div className="px-5 py-4 border-b border-ink-700 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-trust-400">{TYPE_LABEL[entityType] ?? entityType}</p>
          <p className="text-base font-medium text-slate-100 mt-0.5">{label}</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-slate-500 hover:text-slate-200 text-sm">
          ✕
        </button>
      </div>
      <div className="px-5 py-4">
        <p className="text-xs font-medium text-slate-400 mb-3">
          Where this shows up ({mentions?.length ?? '…'})
        </p>
        {error && <p className="text-sm text-alert-high">{error}</p>}
        {!mentions && !error && <p className="text-sm text-slate-500">Loading…</p>}
        <ul className="space-y-3">
          {mentions?.map((m) => (
            <li key={m.mentionId} className="rounded-lg border border-ink-700 px-4 py-3">
              <p className="text-sm text-slate-200 leading-relaxed">"{m.rawText}"</p>
              <p className="text-xs text-slate-500 mt-2">
                {SOURCE_TYPE_LABEL[m.document.sourceType] ?? m.document.sourceType} — {m.document.originalName}
              </p>
              <p className="text-xs text-slate-600">{humanizeLocationRef(m.locationRef)}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
