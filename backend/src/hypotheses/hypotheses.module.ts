import { Module } from '@nestjs/common';
import { HypothesesService } from './hypotheses.service';
import { InternalHypothesesController, HypothesesController } from './hypotheses.controller';

@Module({
  controllers: [InternalHypothesesController, HypothesesController],
  providers: [HypothesesService],
})
export class HypothesesModule {}
