import { Module } from '@nestjs/common';
import { ProcessingService } from './processing.service';
import {
  CaseEntitiesController,
  DocumentEntitiesController,
  InternalProcessingController,
} from './processing.controller';

@Module({
  controllers: [InternalProcessingController, DocumentEntitiesController, CaseEntitiesController],
  providers: [ProcessingService],
})
export class ProcessingModule {}
