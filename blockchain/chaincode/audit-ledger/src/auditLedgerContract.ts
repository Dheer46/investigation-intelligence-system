import { Context, Contract, Info, Returns, Transaction } from 'fabric-contract-api';

// Mirrors the five checkpoint types from the architecture spec (section 8):
// evidence registration, evidence handoff/access, investigation event,
// approval, audit checkpoint. Only a hash + minimal metadata is ever stored
// here - never the underlying document, PII, or bulk evidence content.
interface AnchorEvent {
  eventId: string;
  eventType: string;
  caseId: string;
  hash: string;
  actorId: string;
  actorRole: string;
  timestamp: string;
  metadata: string;
  recordedAt: string;
}

@Info({
  title: 'AuditLedgerContract',
  description: 'Tamper-evident audit anchors for the Investigation Intelligence System',
})
export class AuditLedgerContract extends Contract {
  @Transaction()
  public async RecordEvent(
    ctx: Context,
    eventId: string,
    eventType: string,
    caseId: string,
    hash: string,
    actorId: string,
    actorRole: string,
    timestamp: string,
    metadata: string,
  ): Promise<void> {
    const key = ctx.stub.createCompositeKey('event', [eventId]);
    const existing = await ctx.stub.getState(key);
    if (existing && existing.length > 0) {
      throw new Error(`Event ${eventId} already recorded - the ledger is append-only`);
    }

    const txTimestamp = ctx.stub.getTxTimestamp();
    const record: AnchorEvent = {
      eventId,
      eventType,
      caseId,
      hash,
      actorId,
      actorRole,
      timestamp,
      metadata,
      recordedAt: new Date(txTimestamp.seconds.low * 1000).toISOString(),
    };
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)));

    const caseIndexKey = ctx.stub.createCompositeKey('caseIndex', [caseId, eventId]);
    await ctx.stub.putState(caseIndexKey, Buffer.from(eventId));

    ctx.stub.setEvent('EventRecorded', Buffer.from(JSON.stringify(record)));
  }

  @Transaction(false)
  @Returns('string')
  public async GetEvent(ctx: Context, eventId: string): Promise<string> {
    const key = ctx.stub.createCompositeKey('event', [eventId]);
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) {
      throw new Error(`Event ${eventId} not found`);
    }
    return data.toString();
  }

  // "Was this tampered with" - the ledger's actual job, per the spec's
  // design principle. Never "what does this evidence say."
  @Transaction(false)
  @Returns('string')
  public async VerifyHash(ctx: Context, eventId: string, hash: string): Promise<string> {
    const key = ctx.stub.createCompositeKey('event', [eventId]);
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) {
      throw new Error(`Event ${eventId} not found`);
    }
    const record: AnchorEvent = JSON.parse(data.toString());
    return JSON.stringify({ eventId, matches: record.hash === hash, storedHash: record.hash });
  }

  @Transaction(false)
  @Returns('string')
  public async GetEventsByCase(ctx: Context, caseId: string): Promise<string> {
    const iterator = await ctx.stub.getStateByPartialCompositeKey('caseIndex', [caseId]);
    const eventIds: string[] = [];
    let result = await iterator.next();
    while (!result.done) {
      eventIds.push(Buffer.from(result.value.value).toString());
      result = await iterator.next();
    }
    await iterator.close();

    const events: AnchorEvent[] = [];
    for (const eventId of eventIds) {
      const key = ctx.stub.createCompositeKey('event', [eventId]);
      const data = await ctx.stub.getState(key);
      if (data && data.length > 0) {
        events.push(JSON.parse(data.toString()));
      }
    }
    return JSON.stringify(events);
  }
}
