import { Controller, Get, Param, Query } from '@nestjs/common';
import { SignalsService } from './signals.service';

@Controller('api/signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Get()
  async getSignals(@Query('status') status?: 'ACTIVE' | 'TARGET_HIT' | 'STOPPED_OUT' | 'EXPIRED') {
    return this.signalsService.getSignals(status);
  }

  @Get('stats')
  async getStats() {
    return this.signalsService.getStats();
  }

  @Get('details/:id')
  async getSignalById(@Param('id') id: string) {
    const numericId = parseInt(id, 10);
    return this.signalsService.getSignalById(numericId);
  }
}
