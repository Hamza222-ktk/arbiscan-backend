import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasterAiService } from './master-ai.service';
import { MasterAiController } from './master-ai.controller';
import { MasterSignal, ScalpSignal } from '../database/entities';
import { AlertsModule } from '../alerts/alerts.module';
import { ExchangesModule } from '../exchanges/exchanges.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MasterSignal, ScalpSignal]),
    AlertsModule,
    ExchangesModule,
  ],
  providers: [MasterAiService],
  controllers: [MasterAiController],
  exports: [MasterAiService],
})
export class MasterAiModule {}
