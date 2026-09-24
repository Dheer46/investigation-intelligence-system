import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../common/minio.service';
import { KafkaProducerService, KAFKA_TOPICS } from '../kafka/kafka-producer.service';
import { AuditLogService } from '../audit/audit-log.service';
import { DocumentSourceType, Prisma } from '@prisma/client';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/json',
  'image/png',
  'image/jpeg',
  'image/tiff',
]);

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
    private readonly kafka: KafkaProducerService,
    private readonly auditLog: AuditLogService,
  ) {}

  async upload(
    caseId: string,
    sourceType: DocumentSourceType,
    file: Express.Multer.File,
    uploadedById: string,
    uploadedByRole: string,
    metadataRaw?: string,
  ) {
    const caseRecord = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!caseRecord) {
      throw new NotFoundException(`Case ${caseId} not found`);
    }
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File exceeds maximum allowed size of 50MB');
    }

    const sha256Hash = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `${caseId}/${randomUUID()}-${file.originalname}`;

    let metadata: Prisma.InputJsonValue | undefined;
    if (metadataRaw) {
      try {
        metadata = JSON.parse(metadataRaw);
      } catch {
        throw new BadRequestException('metadata must be valid JSON');
      }
    }

    await this.minio.client.putObject(
      this.minio.evidenceBucket,
      storageKey,
      file.buffer,
      file.size,
      { 'Content-Type': file.mimetype },
    );

    const document = await this.prisma.document.create({
      data: {
        caseId,
        sourceType,
        originalName: file.originalname,
        storageBucket: this.minio.evidenceBucket,
        storageKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        sha256Hash,
        uploadedById,
        status: 'UPLOADED',
        metadata,
      },
    });

    await this.kafka.emit(KAFKA_TOPICS.DOCUMENT_UPLOADED, {
      documentId: document.id,
      caseId,
      sourceType,
      storageBucket: document.storageBucket,
      storageKey: document.storageKey,
      mimeType: document.mimeType,
      sha256Hash,
      uploadedAt: document.uploadedAt.toISOString(),
    });

    this.logger.log(`Document ${document.id} uploaded for case ${caseId}, event emitted`);

    // Evidence registration checkpoint (spec section 8): captures actor,
    // case, timestamp, and the artifact hash - never the file content itself.
    // Phase 8 anchors this same hash on the permissioned ledger.
    await this.auditLog.log({
      actorId: uploadedById,
      actorRole: uploadedByRole,
      action: 'EVIDENCE_REGISTERED',
      targetType: 'Document',
      targetId: document.id,
      caseId,
      result: 'SUCCESS',
      provenance: { sha256Hash, sourceType, originalName: file.originalname },
    });

    return document;
  }

  async findByCase(caseId: string) {
    return this.prisma.document.findMany({
      where: { caseId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) {
      throw new NotFoundException(`Document ${id} not found`);
    }
    return document;
  }

  async getDownloadUrl(id: string, actorId: string, actorRole: string): Promise<string> {
    const document = await this.findOne(id);
    const url = await this.minio.client.presignedGetObject(document.storageBucket, document.storageKey, 300);
    // Evidence handoff/access checkpoint (spec section 8) - who looked at
    // this evidence and when, not the content itself.
    await this.auditLog.log({
      actorId,
      actorRole,
      action: 'EVIDENCE_ACCESSED',
      targetType: 'Document',
      targetId: document.id,
      caseId: document.caseId,
      result: 'SUCCESS',
    });
    return url;
  }

  // Removing a document is itself an audited, ledger-anchored action (see
  // ledger-event-mapping.ts: EVIDENCE_REMOVED) rather than a silent delete -
  // the ledger's earlier EVIDENCE_REGISTRATION entry for this same hash is
  // append-only and can never be un-anchored anyway, so this doesn't erase
  // history, it adds to it: "registered on X, removed on Y by Z."
  async remove(id: string, actorId: string, actorRole: string) {
    const document = await this.findOne(id);

    await this.prisma.$transaction([
      this.prisma.extractedRelation.deleteMany({ where: { documentId: id } }),
      this.prisma.extractedEntity.deleteMany({ where: { documentId: id } }),
      this.prisma.document.delete({ where: { id } }),
    ]);

    try {
      await this.minio.client.removeObject(document.storageBucket, document.storageKey);
    } catch (err) {
      // The Postgres row is already gone (source of truth for what's "in the
      // case") - a leftover object in MinIO is an orphaned-storage cleanup
      // concern, not a reason to fail the removal the user asked for.
      this.logger.warn(`Failed to remove MinIO object for document ${id}: ${(err as Error).message}`);
    }

    await this.auditLog.log({
      actorId,
      actorRole,
      action: 'EVIDENCE_REMOVED',
      targetType: 'Document',
      targetId: id,
      caseId: document.caseId,
      result: 'SUCCESS',
      provenance: { sha256Hash: document.sha256Hash, sourceType: document.sourceType, originalName: document.originalName },
    });

    return { deleted: true };
  }
}
