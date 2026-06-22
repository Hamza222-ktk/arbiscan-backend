import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsService } from './alerts.service';
import { AlertsGateway } from './alerts.gateway';
import { AlertsController } from './alerts.controller';
import { AlertLog } from '../database/entities';

@Module({
  imports: [TypeOrmModule.forFeature([AlertLog])],
  providers: [AlertsService, AlertsGateway],
  controllers: [AlertsController],
  exports: [AlertsService],
})
export class AlertsModule {}
