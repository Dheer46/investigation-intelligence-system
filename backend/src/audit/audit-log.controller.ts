import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuditLogService } from './audit-log.service';

// Read access is deliberately scoped to AUDITOR/ADMINISTRATOR - the audit
// trail exists for independent oversight, not for investigators to browse.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.AUDITOR, Role.ADMINISTRATOR)
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  findAll(@Query('caseId') caseId?: string, @Query('actorId') actorId?: string) {
    return this.auditLogService.findAll({ caseId, actorId });
  }
}
