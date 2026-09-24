import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AuditLogEntry } from '../types';

const ACTION_LABEL: Record<string, string> = {
  LOGIN_SUCCESS: 'Signed in',
  LOGIN_FAILED: 'Failed sign-in attempt',
  USER_REGISTERED: 'Created a new account',
  CASE_CREATED: 'Opened a new case',
  EVIDENCE_REGISTERED: 'Uploaded a file',
  EVIDENCE_ACCESSED: 'Opened a file',
  ENTITY_RESOLUTION_RUN: 'Linked duplicate records',
  ENTITY_RESOLUTION_APPROVED: 'Confirmed a record match',
  ENTITY_RESOLUTION_REJECTED: 'Dismissed a record match',
  ANALYTICS_RUN: 'Analyzed the case',
  HYPOTHESIS_ACCEPTED: 'Confirmed a finding',
  HYPOTHESIS_REJECTED: 'Dismissed a finding',
  HYPOTHESIS_ESCALATED: 'Flagged a finding for a supervisor',
  // USB -> face -> PIN secure access gate
  USB_VALIDATION_PASSED: 'Government USB recognized',
  USB_VALIDATION_FAILED: 'Government USB rejected',
  LIVENESS_FAILED: 'Liveness check failed',
  FACE_VERIFICATION_PASSED: 'Face verified against assigned officer',
  FACE_VERIFICATION_FAILED: 'Face did not match assigned officer',
  PIN_VERIFICATION_PASSED: 'PIN verified',
  PIN_FAILED: 'Incorrect PIN entered',
  PIN_SET: 'PIN configured for an officer',
  USB_TOKEN_ISSUED: 'USB token assigned to an officer',
  USB_TOKEN_REVOKED: 'USB token revoked',
  BIOMETRIC_ENROLLED: 'Face template enrolled',
};

interface LedgerEventDetail {
  eventId: string;
  eventType: string;
  hash: string;
  actorRole: string;
  recordedAt: string;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ledgerDetail, setLedgerDetail] = useState<LedgerEventDetail | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);

  useEffect(() => {
    api.get('/audit-logs').then((res) => setLogs(res.data));
  }, []);

  async function verifyOnLedger(log: AuditLogEntry) {
    if (expandedId === log.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(log.id);
    setLedgerDetail(null);
    setLedgerError(null);
    setLoadingLedger(true);
    try {
      const res = await api.get(`/ledger/events/${log.ledgerAnchor!.ledgerTxId}`);
      setLedgerDetail(res.data);
    } catch {
      setLedgerError('Could not reach the permissioned ledger to re-verify this event.');
    } finally {
      setLoadingLedger(false);
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="font-serif text-2xl text-slate-100 mb-1">Activity Log</h1>
      <p className="text-sm text-slate-500 mb-6">
        A record of who did what, and when. Entries marked "Verified" are permanently sealed and
        cannot be altered by anyone — not even an administrator.
      </p>

      <div className="rounded-xl border border-ink-700 bg-ink-900 divide-y divide-ink-700">
        {logs.map((log) => (
          <div key={log.id}>
            <div className="px-5 py-3.5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-100">
                  <span className="font-medium">{log.actor?.fullName ?? 'System'}</span>{' '}
                  {ACTION_LABEL[log.action] ?? log.action.replace(/_/g, ' ').toLowerCase()}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {log.actor?.role}
                  {log.case && ` · ${log.case.title}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-slate-500">
                  {new Date(log.createdAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
                {log.ledgerAnchor && (
                  <button
                    onClick={() => verifyOnLedger(log)}
                    className="mt-1.5 rounded-full border border-alert-low/30 bg-alert-low/10 px-2.5 py-1 text-xs font-medium text-alert-low hover:bg-alert-low/20"
                  >
                    ✓ Verified — check
                  </button>
                )}
                {log.result === 'FAILURE' && (
                  <p className="mt-1 text-xs font-medium text-alert-high">Did not succeed</p>
                )}
              </div>
            </div>
            {expandedId === log.id && (
              <div className="px-5 pb-4 text-xs bg-ink-800/40">
                {loadingLedger && <p className="text-slate-500">Checking the permanent record…</p>}
                {ledgerError && <p className="text-alert-high">{ledgerError}</p>}
                {ledgerDetail && (
                  <div className="rounded-md border border-ink-700 p-3 space-y-1">
                    <p className="text-alert-low font-medium">
                      ✓ This record matches exactly what was sealed — nothing has been changed.
                    </p>
                    <p className="text-slate-500">
                      Sealed on {new Date(ledgerDetail.recordedAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {logs.length === 0 && <p className="px-5 py-8 text-sm text-slate-500">No activity recorded yet.</p>}
      </div>
    </div>
  );
}
