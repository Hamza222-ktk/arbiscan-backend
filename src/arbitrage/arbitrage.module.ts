import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArbitrageService } from './arbitrage.service';
import { ArbitrageController } from './arbitrage.controller';
import { ArbitrageGateway } from './arbitrage.gateway';
import { ArbitrageHistory } from '../database/entities';
import { ExchangesModule } from '../exchanges/exchanges.module';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ArbitrageHistory]),
    ExchangesModule,
    AlertsModule,
  ],
  providers: [ArbitrageService, ArbitrageGateway],
  controllers: [ArbitrageController],
  exports: [ArbitrageService],
})
export class ArbitrageModule {}
