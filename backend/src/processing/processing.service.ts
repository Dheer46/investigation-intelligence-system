import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExtractionResultDto } from './dto/extraction-result.dto';

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async saveExtractionResults(documentId: string, dto: ExtractionResultDto) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    await this.prisma.$transaction([
      this.prisma.extractedEntity.createMany({
        data: dto.entities.map((entity) => ({
          documentId,
          entityType: entity.entity_type,
          rawText: entity.raw_text,
          normalized: entity.normalized,
          locationRef: entity.location_ref,
          confidence: entity.confidence,
        })),
      }),
      this.prisma.extractedRelation.createMany({
        data: dto.relations.map((relation) => ({
          documentId,
          sourceText: relation.source_text,
          subjectText: relation.subject_text,
          predicate: relation.predicate,
          objectText: relation.object_text,
          locationRef: relation.location_ref,
          confidence: relation.confidence,
        })),
      }),
      this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'PROCESSED', processedAt: new Date() },
      }),
    ]);

    this.logger.log(
      `Stored ${dto.entities.length} entities and ${dto.relations.length} relations for document ${documentId}`,
    );

    return { entitiesStored: dto.entities.length, relationsStored: dto.relations.length };
  }

  findEntitiesByDocument(documentId: string) {
    return this.prisma.extractedEntity.findMany({ where: { documentId }, orderBy: { createdAt: 'asc' } });
  }

  findRelationsByDocument(documentId: string) {
    return this.prisma.extractedRelation.findMany({ where: { documentId }, orderBy: { createdAt: 'asc' } });
  }

  async findEntitiesByCase(caseId: string) {
    return this.prisma.extractedEntity.findMany({
      where: { document: { caseId } },
      include: { document: { select: { id: true, originalName: true, sourceType: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findRelationsByCase(caseId: string) {
    return this.prisma.extractedRelation.findMany({
      where: { document: { caseId } },
      include: { document: { select: { id: true, originalName: true, sourceType: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
