import { Controller, Get, NotFoundException, Param, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LedgerService } from './ledger.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('ledger/events/:eventId')
  async getEvent(@Param('eventId') eventId: string) {
    if (!this.ledger.isConnected) {
      throw new ServiceUnavailableException('Permissioned ledger is not reachable');
    }
    const event = await this.ledger.getEvent(eventId);
    if (!event) {
      throw new NotFoundException(`No ledger event ${eventId}`);
    }
    return event;
  }

  @Get('ledger/verify/:eventId')
  async verify(@Param('eventId') eventId: string, @Query('hash') hash: string) {
    if (!this.ledger.isConnected) {
      throw new ServiceUnavailableException('Permissioned ledger is not reachable');
    }
    const result = await this.ledger.verifyHash(eventId, hash);
    if (!result) {
      throw new NotFoundException(`No ledger event ${eventId}`);
    }
    return result;
  }

  @Get('cases/:caseId/ledger-events')
  async getCaseEvents(@Param('caseId') caseId: string) {
    if (!this.ledger.isConnected) {
      return { connected: false, events: [] };
    }
    const events = await this.ledger.getEventsByCase(caseId);
    return { connected: true, events: events ?? [] };
  }
}
