import { Controller, Get, Delete, Query } from '@nestjs/common';
import { AlertsService } from './alerts.service';

@Controller('api/alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get('live')
  async getLive(@Query('limit') limit?: string) {
    const lim = limit ? parseInt(limit, 10) : 30;
    return this.alertsService.getLiveAlerts(lim);
  }

  @Get('history')
  async getHistory(@Query('limit') limit?: string) {
    const lim = limit ? parseInt(limit, 10) : 50;
    return this.alertsService.getLiveAlerts(lim);
  }

  @Delete('history')
  async deleteHistory() {
    await this.alertsService.clearHistory();
    return { success: true, message: 'Alert history deleted successfully.' };
  }
}
