import { Module } from '@nestjs/common';
import { ResolutionService } from './resolution.service';
import {
  InternalResolutionController,
  ResolveTriggerController,
  ReviewQueueController,
} from './resolution.controller';

@Module({
  controllers: [InternalResolutionController, ResolveTriggerController, ReviewQueueController],
  providers: [ResolutionService],
})
export class ResolutionModule {}
