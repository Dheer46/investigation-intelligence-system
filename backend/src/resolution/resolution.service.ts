import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { ResolutionResultsDto } from './dto/resolution-results.dto';

@Injectable()
export class ResolutionService {
  private readonly logger = new Logger(ResolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly config: ConfigService,
  ) {}

  // The frontend never calls the ai-service directly - it has no auth of its
  // own. Routing the trigger through here means "who's allowed to kick off
  // entity resolution" is governed by the same JWT+RBAC guard as everything else.
  async triggerResolution(caseId: string, actorId: string, actorRole: string) {
    const caseRecord = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!caseRecord) {
      throw new NotFoundException(`Case ${caseId} not found`);
    }
    const aiServiceUrl = this.config.get<string>('AI_SERVICE_URL', 'http://ai-service:8000');
    const response = await fetch(`${aiServiceUrl}/resolve/cases/${caseId}`, { method: 'POST' });
    if (!response.ok) {
      throw new Error(`ai-service resolution trigger failed: ${response.status}`);
    }
    const result = await response.json();
    await this.auditLog.log({
      actorId,
      actorRole,
      action: 'ENTITY_RESOLUTION_RUN',
      targetType: 'Case',
      targetId: caseId,
      caseId,
      result: 'SUCCESS',
      provenance: result,
    });
    return result;
  }

  async getEntitiesForCase(caseId: string) {
    const caseRecord = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!caseRecord) {
      throw new NotFoundException(`Case ${caseId} not found`);
    }
    return this.prisma.extractedEntity.findMany({
      where: { document: { caseId } },
      include: { document: { select: { id: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async saveResolutionResults(caseId: string, dto: ResolutionResultsDto) {
    const caseRecord = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!caseRecord) {
      throw new NotFoundException(`Case ${caseId} not found`);
    }

    let entitiesMerged = 0;
    for (const group of dto.auto_merges) {
      const resolved = await this.prisma.resolvedEntity.create({
        data: {
          entityType: group.entity_type,
          canonicalName: group.canonical_name,
          attributes: (group.attributes ?? {}) as Prisma.InputJsonValue,
        },
      });
      const { count } = await this.prisma.extractedEntity.updateMany({
        where: { id: { in: group.member_entity_ids } },
        data: { resolvedEntityId: resolved.id },
      });
      entitiesMerged += count;
    }

    const candidates = await this.prisma.$transaction(
      dto.review_candidates.map((group) =>
        this.prisma.entityResolutionCandidate.create({
          data: {
            caseId,
            entityType: group.entity_type,
            canonicalName: group.canonical_name,
            memberEntityIds: group.member_entity_ids,
            matchScore: group.match_score,
          },
        }),
      ),
    );

    this.logger.log(
      `Case ${caseId}: ${dto.auto_merges.length} auto-merge group(s) (${entitiesMerged} entities), ${candidates.length} candidate(s) queued for review`,
    );

    return {
      autoMergeGroups: dto.auto_merges.length,
      entitiesMerged,
      reviewCandidatesQueued: candidates.length,
    };
  }

  // Candidates are queued case-by-case, but reviewers work across every open
  // case at once - without a filter, an old test/demo case with hundreds of
  // queued candidates buries the handful that matter for the case someone is
  // actually working on. caseId narrows the list; status keeps its own filter.
  listReviewQueue(status?: ReviewStatus, caseId?: string) {
    return this.prisma.entityResolutionCandidate.findMany({
      where: {
        ...(status ? { decision: status } : {}),
        ...(caseId ? { caseId } : {}),
      },
      include: { case: { select: { id: true, caseNumber: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async decideReview(id: string, decision: ReviewStatus, actorId: string, actorRole: string, notes?: string) {
    const candidate = await this.prisma.entityResolutionCandidate.findUnique({ where: { id } });
    if (!candidate) {
      throw new NotFoundException(`Review candidate ${id} not found`);
    }
    if (candidate.decision !== 'PENDING') {
      throw new BadRequestException(`Candidate ${id} has already been reviewed`);
    }

    if (decision === 'APPROVED') {
      const resolved = await this.prisma.resolvedEntity.create({
        data: {
          entityType: candidate.entityType,
          canonicalName: candidate.canonicalName,
          attributes: { reviewedById: actorId, reviewNotes: notes ?? null },
        },
      });
      await this.prisma.extractedEntity.updateMany({
        where: { id: { in: candidate.memberEntityIds } },
        data: { resolvedEntityId: resolved.id },
      });
    }

    const updated = await this.prisma.entityResolutionCandidate.update({
      where: { id },
      data: { decision, reviewedById: actorId, reviewedAt: new Date() },
    });

    await this.auditLog.log({
      actorId,
      actorRole,
      action: `ENTITY_RESOLUTION_${decision}`,
      targetType: 'EntityResolutionCandidate',
      targetId: id,
      caseId: candidate.caseId,
      result: 'SUCCESS',
      provenance: { canonicalName: candidate.canonicalName, matchScore: candidate.matchScore, notes },
    });

    return updated;
  }
}
