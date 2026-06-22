import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScalpService } from './scalp.service';
import { ScalpController } from './scalp.controller';
import { ScalpGateway } from './scalp.gateway';
import { ScalpSignal } from '../database/entities';
import { AlertsModule } from '../alerts/alerts.module';
import { ExchangesModule } from '../exchanges/exchanges.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScalpSignal]),
    AlertsModule,
    ExchangesModule,
  ],
  providers: [ScalpService, ScalpGateway],
  controllers: [ScalpController],
  exports: [ScalpService],
})
export class ScalpModule {}
