import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('api/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('event')
  async logEvent(
    @Body('eventType') eventType: string,
    @Body('deviceUuid') deviceUuid: string,
    @Body('metadata') metadata?: any,
  ) {
    await this.analyticsService.logEvent(eventType, deviceUuid, metadata || {});
    return { success: true };
  }

  @Get('config/ads')
  getAdConfig(@Query('deviceUuid') deviceUuid?: string) {
    return this.analyticsService.getAdConfig(deviceUuid);
  }

  @Post('boost')
  async registerBoost(@Body('deviceUuid') deviceUuid: string) {
    if (!deviceUuid) {
      return { success: false, error: 'deviceUuid is required' };
    }
    await this.analyticsService.registerBoost(deviceUuid);
    return {
      success: true,
      expiryTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      message: '30-minute boosted refresh scan unlocked successfully.'
    };
  }
}
