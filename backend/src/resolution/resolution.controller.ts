import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ReviewStatus, Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { InternalApiKeyGuard } from '../processing/internal-api-key.guard';
import { ResolutionService } from './resolution.service';
import { ResolutionResultsDto } from './dto/resolution-results.dto';
import { ReviewDecisionDto } from './dto/review-decision.dto';

// ai-service reads entities and posts back resolution decisions here - same
// service-to-service trust boundary as the Phase 3 extraction-results endpoint.
@UseGuards(InternalApiKeyGuard)
@Controller('internal/cases/:caseId')
export class InternalResolutionController {
  constructor(private readonly resolutionService: ResolutionService) {}

  @Get('entities')
  getEntities(@Param('caseId') caseId: string) {
    return this.resolutionService.getEntitiesForCase(caseId);
  }

  @Post('resolution-results')
  saveResults(@Param('caseId') caseId: string, @Body() dto: ResolutionResultsDto) {
    return this.resolutionService.saveResolutionResults(caseId, dto);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('cases/:caseId/resolve')
export class ResolveTriggerController {
  constructor(private readonly resolutionService: ResolutionService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.INVESTIGATOR, Role.SUPERVISOR, Role.ADMINISTRATOR)
  @Post()
  trigger(@Param('caseId') caseId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.resolutionService.triggerResolution(caseId, user.userId, user.role);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('review-queue')
export class ReviewQueueController {
  constructor(private readonly resolutionService: ResolutionService) {}

  @Get()
  list(@Query('status') status?: ReviewStatus, @Query('caseId') caseId?: string) {
    return this.resolutionService.listReviewQueue(status, caseId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.INVESTIGATOR, Role.SUPERVISOR, Role.ADMINISTRATOR)
  @Post(':id/decision')
  decide(
    @Param('id') id: string,
    @Body() dto: ReviewDecisionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.resolutionService.decideReview(id, dto.decision as ReviewStatus, user.userId, user.role, dto.notes);
  }
}
