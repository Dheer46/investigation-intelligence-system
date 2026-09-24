import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { InternalApiKeyGuard } from '../processing/internal-api-key.guard';
import { HypothesesService } from './hypotheses.service';
import { HypothesesBulkDto } from './dto/hypotheses-bulk.dto';
import { HypothesisActionDto } from './dto/hypothesis-action.dto';

@UseGuards(InternalApiKeyGuard)
@Controller('internal/cases/:caseId/hypotheses')
export class InternalHypothesesController {
  constructor(private readonly hypothesesService: HypothesesService) {}

  @Post()
  createBulk(@Param('caseId') caseId: string, @Body() dto: HypothesesBulkDto) {
    return this.hypothesesService.createBulk(caseId, dto);
  }
}

@UseGuards(JwtAuthGuard)
@Controller()
export class HypothesesController {
  constructor(private readonly hypothesesService: HypothesesService) {}

  @Get('cases/:caseId/hypotheses')
  findByCase(@Param('caseId') caseId: string) {
    return this.hypothesesService.findByCase(caseId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.INVESTIGATOR, Role.SUPERVISOR, Role.ADMINISTRATOR)
  @Post('hypotheses/:id/actions')
  recordAction(
    @Param('id') id: string,
    @Body() dto: HypothesisActionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.hypothesesService.recordAction(id, dto.action, user.userId, user.role, dto.notes);
  }
}
