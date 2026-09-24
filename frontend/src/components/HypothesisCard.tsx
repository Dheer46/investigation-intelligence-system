import { useState } from 'react';
import { canAct, useAuthStore } from '../store/auth';
import ConfidenceBadge from './ConfidenceBadge';
import type { Hypothesis } from '../types';

const TYPE_LABEL: Record<string, string> = {
  HIDDEN_LINK: 'Possible hidden link',
  COMMUNITY: 'Group of associates',
  ANOMALY: 'Unusual pattern',
};

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  ACCEPTED: { label: 'Confirmed', className: 'text-alert-low' },
  REJECTED: { label: 'Dismissed', className: 'text-alert-high' },
  ESCALATED: { label: 'Escalated', className: 'text-alert-medium' },
};

interface Props {
  hypothesis: Hypothesis;
  onAction: (id: string, action: 'ACCEPTED' | 'REJECTED' | 'ESCALATED', notes?: string) => Promise<void>;
}

export default function HypothesisCard({ hypothesis, onAction }: Props) {
  const role = useAuthStore((s) => s.user?.role);
  const [busy, setBusy] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [notes, setNotes] = useState('');

  async function act(action: 'ACCEPTED' | 'REJECTED' | 'ESCALATED') {
    setBusy(true);
    try {
      await onAction(hypothesis.id, action, notes || undefined);
    } finally {
      setBusy(false);
    }
  }

  const isPending = hypothesis.status === 'PENDING_REVIEW';
  const status = STATUS_LABEL[hypothesis.status];

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-5">
      <div className="flex items-start justify-between gap-4">
        <span className="text-xs font-medium text-trust-400">
          {TYPE_LABEL[hypothesis.evidenceSummary.type] ?? 'Finding'}
        </span>
        {isPending ? (
          <ConfidenceBadge score={hypothesis.confidence} />
        ) : (
          <span className={`text-xs font-medium ${status?.className ?? 'text-slate-400'}`}>{status?.label}</span>
        )}
      </div>

      <p className="text-sm text-slate-100 mt-2 leading-relaxed">{hypothesis.hypothesisText}</p>

      <button
        onClick={() => setShowWhy((v) => !v)}
        className="mt-2 text-xs text-slate-500 hover:text-slate-300 underline decoration-dotted underline-offset-2"
      >
        {showWhy ? 'Hide details' : 'Why is this being suggested?'}
      </button>
      {showWhy && (
        <p className="mt-2 text-xs text-slate-500 bg-ink-800/60 rounded-md p-3">
          Found automatically by the network analysis on{' '}
          {new Date(hypothesis.provenance.computedAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
          . This is a computer-generated suggestion — it still needs a person to confirm it.
        </p>
      )}

      {isPending && canAct(role) && (
        <div className="mt-4 space-y-2">
          {showNotes ? (
            <input
              autoFocus
              placeholder="Add a note (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md bg-ink-800 border border-ink-700 px-3 py-2 text-sm text-slate-100"
            />
          ) : (
            <button
              onClick={() => setShowNotes(true)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              + Add a note
            </button>
          )}
          <div className="flex gap-2 pt-1">
            <button
              disabled={busy}
              onClick={() => act('ACCEPTED')}
              className="rounded-md bg-alert-low/15 text-alert-low border border-alert-low/30 px-4 py-1.5 text-sm font-medium hover:bg-alert-low/25 disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              disabled={busy}
              onClick={() => act('REJECTED')}
              className="rounded-md bg-alert-high/15 text-alert-high border border-alert-high/30 px-4 py-1.5 text-sm font-medium hover:bg-alert-high/25 disabled:opacity-50"
            >
              Dismiss
            </button>
            <button
              disabled={busy}
              onClick={() => act('ESCALATED')}
              className="rounded-md bg-alert-medium/15 text-alert-medium border border-alert-medium/30 px-4 py-1.5 text-sm font-medium hover:bg-alert-medium/25 disabled:opacity-50"
            >
              Flag for supervisor
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
