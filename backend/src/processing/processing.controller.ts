import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InternalApiKeyGuard } from './internal-api-key.guard';
import { ProcessingService } from './processing.service';
import { ExtractionResultDto } from './dto/extraction-result.dto';

// Internal, service-to-service ingestion endpoint: the ai-service posts here
// once it finishes extraction for a document. Guarded by a shared secret
// (not user JWTs) since the caller is another backend service, not a person.
@UseGuards(InternalApiKeyGuard)
@Controller('internal/documents')
export class InternalProcessingController {
  constructor(private readonly processingService: ProcessingService) {}

  @Post(':documentId/extraction-results')
  saveResults(@Param('documentId') documentId: string, @Body() dto: ExtractionResultDto) {
    return this.processingService.saveExtractionResults(documentId, dto);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentEntitiesController {
  constructor(private readonly processingService: ProcessingService) {}

  @Get(':documentId/entities')
  findEntities(@Param('documentId') documentId: string) {
    return this.processingService.findEntitiesByDocument(documentId);
  }

  @Get(':documentId/relations')
  findRelations(@Param('documentId') documentId: string) {
    return this.processingService.findRelationsByDocument(documentId);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('cases/:caseId')
export class CaseEntitiesController {
  constructor(private readonly processingService: ProcessingService) {}

  @Get('entities')
  findEntities(@Param('caseId') caseId: string) {
    return this.processingService.findEntitiesByCase(caseId);
  }

  @Get('relations')
  findRelations(@Param('caseId') caseId: string) {
    return this.processingService.findRelationsByCase(caseId);
  }
}
