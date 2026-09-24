import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HypothesisStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { HypothesesBulkDto } from './dto/hypotheses-bulk.dto';

@Injectable()
export class HypothesesService {
  private readonly logger = new Logger(HypothesesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async createBulk(caseId: string, dto: HypothesesBulkDto) {
    const caseRecord = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!caseRecord) {
      throw new NotFoundException(`Case ${caseId} not found`);
    }

    if (dto.hypotheses.length === 0) {
      return { hypothesesCreated: 0 };
    }

    await this.prisma.$transaction(
      dto.hypotheses.map((h) =>
        this.prisma.hypothesis.create({
          data: {
            caseId,
            hypothesisText: h.hypothesis_text,
            evidenceSummary: h.evidence_summary as Prisma.InputJsonValue,
            confidence: h.confidence,
            provenance: h.provenance as Prisma.InputJsonValue,
          },
        }),
      ),
    );

    this.logger.log(`Case ${caseId}: created ${dto.hypotheses.length} hypotheses from analytics run`);
    return { hypothesesCreated: dto.hypotheses.length };
  }

  findByCase(caseId: string) {
    return this.prisma.hypothesis.findMany({
      where: { caseId },
      orderBy: [{ status: 'asc' }, { confidence: 'desc' }],
    });
  }

  async recordAction(hypothesisId: string, action: HypothesisStatus, actorId: string, actorRole: string, notes?: string) {
    const hypothesis = await this.prisma.hypothesis.findUnique({ where: { id: hypothesisId } });
    if (!hypothesis) {
      throw new NotFoundException(`Hypothesis ${hypothesisId} not found`);
    }

    const [, , updated] = await this.prisma.$transaction([
      this.prisma.hypothesisAction.create({
        data: { hypothesisId, action, actorId, notes },
      }),
      this.prisma.hypothesis.update({ where: { id: hypothesisId }, data: { status: action } }),
      this.prisma.hypothesis.findUniqueOrThrow({ where: { id: hypothesisId } }),
    ]);

    // Audit connection (spec section 10): an investigator's accept/reject/
    // escalate decision on an AI hypothesis always produces an audit event,
    // and AuditLogService anchors its hash on the permissioned ledger.
    const auditLog = await this.auditLog.log({
      actorId,
      actorRole,
      action: `HYPOTHESIS_${action}`,
      targetType: 'Hypothesis',
      targetId: hypothesisId,
      caseId: hypothesis.caseId,
      result: 'SUCCESS',
      provenance: hypothesis.provenance as Record<string, unknown>,
    });

    return { hypothesis: updated, auditLogId: auditLog.id };
  }
}
