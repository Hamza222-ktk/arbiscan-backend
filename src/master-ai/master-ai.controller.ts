import { Controller, Get, Query } from '@nestjs/common';
import { MasterAiService } from './master-ai.service';

@Controller('api/master')
export class MasterAiController {
  constructor(private readonly masterAiService: MasterAiService) {}

  @Get('signal')
  async getLiveSignals() {
    return this.masterAiService.getLiveMasterSignals();
  }

  @Get('regime')
  getRegime(@Query('coin') coin?: string) {
    const targetCoin = coin ? coin.toUpperCase() : 'BTC';
    return this.masterAiService.detectRegime(targetCoin, 102500);
  }

  @Get('performance')
  async getPerformance() {
    return this.masterAiService.getPerformanceStats();
  }
}
