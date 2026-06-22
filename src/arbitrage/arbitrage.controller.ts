import { Controller, Get, Param, Query } from '@nestjs/common';
import { ArbitrageService, ArbitrageOpportunity } from './arbitrage.service';
import { ExchangesService } from '../exchanges/exchanges.service';

@Controller('api/arbitrage')
export class ArbitrageController {
  constructor(
    private readonly arbitrageService: ArbitrageService,
    private readonly exchangesService: ExchangesService
  ) {}

  @Get('live')
  getLiveOpportunities(
    @Query('minProfit') minProfit?: string,
    @Query('exchange') exchange?: string,
    @Query('coin') coin?: string,
    @Query('risk') risk?: 'LOW' | 'MEDIUM' | 'HIGH',
  ) {
    const filters = {
      minProfit: minProfit ? parseFloat(minProfit) : undefined,
      exchange,
      coin,
      risk,
    };
    return this.arbitrageService.getActiveOpportunities(filters);
  }

  @Get('details/:id')
  getOpportunityDetails(@Param('id') id: string): ArbitrageOpportunity | { error: string } {
    const opp = this.arbitrageService.getActiveOpportunities().find((o) => o.id === id);
    if (!opp) {
      return { error: 'Arbitrage opportunity expired or not found.' };
    }
    return opp;
  }

  @Get('trending')
  async getTrending() {
    return this.arbitrageService.getTrendingOpportunities();
  }

  @Get('futures')
  getFuturesArbitrage() {
    return this.arbitrageService.getFuturesArbitrage();
  }

  @Get('funding')
  async getFundingArbitrage() {
    return this.exchangesService.getFundingRates();
  }
}
