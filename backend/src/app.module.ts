import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { KafkaModule } from './kafka/kafka.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { CasesModule } from './cases/cases.module';
import { DocumentsModule } from './documents/documents.module';
import { ProcessingModule } from './processing/processing.module';
import { ResolutionModule } from './resolution/resolution.module';
import { GraphModule } from './graph/graph.module';
import { HypothesesModule } from './hypotheses/hypotheses.module';
import { AuditLogModule } from './audit/audit-log.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    KafkaModule,
    AuditLogModule,
    HealthModule,
    AuthModule,
    CasesModule,
    DocumentsModule,
    ProcessingModule,
    ResolutionModule,
    GraphModule,
    HypothesesModule,
  ],
})
export class AppModule {}
