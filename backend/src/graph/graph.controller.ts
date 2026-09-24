import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { GraphService } from './graph.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class GraphController {
  constructor(private readonly graphService: GraphService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.INVESTIGATOR, Role.SUPERVISOR, Role.ADMINISTRATOR)
  @Post('cases/:caseId/graph/sync')
  sync(@Param('caseId') caseId: string) {
    return this.graphService.syncCaseToGraph(caseId);
  }

  @Get('cases/:caseId/graph')
  getGraph(@Param('caseId') caseId: string) {
    return this.graphService.getCaseGraph(caseId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.INVESTIGATOR, Role.SUPERVISOR, Role.ADMINISTRATOR)
  @Post('cases/:caseId/analytics/run')
  runAnalytics(@Param('caseId') caseId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.graphService.triggerAnalytics(caseId, user.userId, user.role);
  }

  @Get('search/entities')
  search(@Query('q') query: string) {
    return this.graphService.searchEntities(query ?? '');
  }

  @Get('entities/:nodeId/evidence')
  evidence(@Param('nodeId') nodeId: string) {
    return this.graphService.getEntityEvidence(nodeId);
  }

  @Get('dashboard/metrics')
  metrics() {
    return this.graphService.getDashboardMetrics();
  }

  @Get('cases/:caseId/top-connectors')
  topConnectors(@Param('caseId') caseId: string) {
    return this.graphService.getTopConnectors(caseId);
  }

  @Get('cases/:caseId/reconstruction')
  reconstruction(@Param('caseId') caseId: string) {
    return this.graphService.getReconstruction(caseId);
  }
}
