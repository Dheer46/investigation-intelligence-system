import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DocumentSourceType } from '@prisma/client';

export class UploadDocumentDto {
  @IsEnum(DocumentSourceType)
  sourceType: DocumentSourceType;

  // JSON-encoded (multipart fields only carry strings) structured metadata for
  // uploads that aren't a plain file a human dropped in - e.g. a social feed
  // post composed in-app. Opaque to this DTO; documents.service just stores it.
  @IsOptional()
  @IsString()
  metadata?: string;
}
