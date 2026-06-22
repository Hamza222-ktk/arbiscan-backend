import { Controller, Get, Query } from '@nestjs/common';
import { ScalpService } from './scalp.service';

@Controller('api/scalp')
export class ScalpController {
  constructor(private readonly scalpService: ScalpService) {}

  @Get('live')
  async getLive() {
    return this.scalpService.getLiveScalps();
  }

  @Get('history')
  async getHistory(@Query('limit') limit?: string) {
    const lim = limit ? parseInt(limit, 10) : 30;
    return this.scalpService.getScalpHistory(lim);
  }
}
