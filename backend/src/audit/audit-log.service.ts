import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { mapActionToLedgerEventType } from './ledger-event-mapping';

export interface AuditLogInput {
  actorId?: string | null;
  actorRole?: string;
  action: string;
  targetType: string;
  targetId: string;
  caseId?: string | null;
  result: 'SUCCESS' | 'FAILURE';
  provenance?: Record<string, unknown>;
  ipAddress?: string;
}

// Every mutating action in the system should call this - it's the single
// place that guarantees actor/action/target/timestamp/result/provenance are
// all recorded together (Postgres), and the one place that decides whether
// an event is significant enough to also anchor on the permissioned ledger.
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async log(input: AuditLogInput) {
    const entry = await this.prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? undefined,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        caseId: input.caseId || undefined,
        result: input.result,
        provenance: (input.provenance ?? {}) as Prisma.InputJsonValue,
        ipAddress: input.ipAddress,
      },
    });

    await this.maybeAnchorOnLedger(entry.id, input);

    return entry;
  }

  private async maybeAnchorOnLedger(auditLogId: string, input: AuditLogInput) {
    if (input.result !== 'SUCCESS') return;
    const ledgerEventType = mapActionToLedgerEventType(input.action);
    if (!ledgerEventType) return;
    if (!this.ledger.isConnected) return; // Postgres audit log already succeeded; ledger is best-effort

    // Evidence events already carry a real artifact hash (sha256Hash); other
    // event types anchor a hash of the audit record itself - the "audit
    // checkpoint" pattern from the spec's event-type table.
    const artifactHash =
      (input.provenance?.sha256Hash as string | undefined) ??
      createHash('sha256')
        .update(
          JSON.stringify({
            action: input.action,
            targetType: input.targetType,
            targetId: input.targetId,
            actorId: input.actorId,
            caseId: input.caseId,
            provenance: input.provenance,
          }),
        )
        .digest('hex');

    try {
      await this.ledger.recordEvent({
        eventId: auditLogId,
        eventType: ledgerEventType,
        caseId: input.caseId ?? '',
        hash: artifactHash,
        actorId: input.actorId ?? 'system',
        actorRole: input.actorRole ?? 'unknown',
        timestamp: new Date().toISOString(),
        metadata: { action: input.action, targetType: input.targetType, targetId: input.targetId },
      });

      await this.prisma.ledgerAnchor.create({
        data: {
          eventType: ledgerEventType,
          artifactHash,
          ledgerTxId: auditLogId,
          channelName: 'auditchannel',
          actorId: input.actorId ?? 'system',
          caseId: input.caseId || undefined,
          auditLogId,
          verified: true,
          verifiedAt: new Date(),
        },
      });
    } catch (err) {
      // Never let a ledger outage break the primary application flow - the
      // Postgres audit trail is already durable regardless.
      this.logger.warn(`Ledger anchor failed for audit log ${auditLogId}: ${(err as Error).message}`);
    }
  }

  findAll(filters: { caseId?: string; actorId?: string }) {
    return this.prisma.auditLog.findMany({
      where: {
        caseId: filters.caseId || undefined,
        actorId: filters.actorId || undefined,
      },
      include: {
        actor: { select: { id: true, fullName: true, role: true } },
        case: { select: { id: true, caseNumber: true, title: true } },
        ledgerAnchor: { select: { ledgerTxId: true, verified: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
