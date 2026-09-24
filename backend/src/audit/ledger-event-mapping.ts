import { LedgerEventType } from '@prisma/client';

// Not every audit-logged action warrants a ledger anchor - login attempts and
// account provisioning are app-internal, not evidence/investigation actions.
// This is the "not everywhere" half of the spec's design principle.
const ACTION_TO_LEDGER_EVENT_TYPE: Record<string, LedgerEventType> = {
  EVIDENCE_REGISTERED: LedgerEventType.EVIDENCE_REGISTRATION,
  EVIDENCE_ACCESSED: LedgerEventType.EVIDENCE_HANDOFF,
  EVIDENCE_REMOVED: LedgerEventType.AUDIT_CHECKPOINT,
  HYPOTHESIS_ACCEPTED: LedgerEventType.APPROVAL,
  HYPOTHESIS_REJECTED: LedgerEventType.APPROVAL,
  HYPOTHESIS_ESCALATED: LedgerEventType.APPROVAL,
  ENTITY_RESOLUTION_APPROVED: LedgerEventType.APPROVAL,
  ENTITY_RESOLUTION_REJECTED: LedgerEventType.APPROVAL,
  CASE_CREATED: LedgerEventType.INVESTIGATION_EVENT,
  ANALYTICS_RUN: LedgerEventType.INVESTIGATION_EVENT,
  ENTITY_RESOLUTION_RUN: LedgerEventType.INVESTIGATION_EVENT,
};

export function mapActionToLedgerEventType(action: string): LedgerEventType | null {
  return ACTION_TO_LEDGER_EVENT_TYPE[action] ?? null;
}
