import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { CreateCaseDto } from './dto/create-case.dto';

@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreateCaseDto, createdById: string, createdByRole: string) {
    const created = await this.prisma.case.create({
      data: {
        caseNumber: dto.caseNumber,
        title: dto.title,
        description: dto.description,
        createdById,
      },
    });
    await this.auditLog.log({
      actorId: createdById,
      actorRole: createdByRole,
      action: 'CASE_CREATED',
      targetType: 'Case',
      targetId: created.id,
      caseId: created.id,
      result: 'SUCCESS',
      provenance: { caseNumber: created.caseNumber, title: created.title },
    });
    return created;
  }

  findAll() {
    return this.prisma.case.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { documents: true, hypotheses: true } } },
    });
  }

  async findOne(id: string) {
    const found = await this.prisma.case.findUnique({
      where: { id },
      include: {
        documents: { orderBy: { uploadedAt: 'desc' } },
        hypotheses: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!found) {
      throw new NotFoundException(`Case ${id} not found`);
    }
    return found;
  }
}
