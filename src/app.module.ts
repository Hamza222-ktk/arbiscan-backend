import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import * as dotenv from 'dotenv';
import { Exchange, ExchangePair, Signal, ArbitrageHistory, AlertLog, AnalyticsEvent, ScalpSignal, MasterSignal } from './database/entities';
import { ExchangesModule } from './exchanges/exchanges.module';
import { ArbitrageModule } from './arbitrage/arbitrage.module';
import { SignalsModule } from './signals/signals.module';
import { AlertsModule } from './alerts/alerts.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ScalpModule } from './scalp/scalp.module';
import { MasterAiModule } from './master-ai/master-ai.module';

dotenv.config();

const dbType = process.env.DB_TYPE === 'postgres' ? 'postgres' : 'sqlite';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 60,
    }]),
    TypeOrmModule.forRoot({
      type: dbType as any,
      database: process.env.DB_DATABASE || (dbType === 'sqlite' ? 'db.sqlite' : 'arbitrage_db'),
      host: dbType === 'postgres' ? process.env.DB_HOST || 'localhost' : undefined,
      port: dbType === 'postgres' ? parseInt(process.env.DB_PORT || '5432', 10) : undefined,
      username: dbType === 'postgres' ? process.env.DB_USERNAME || 'postgres' : undefined,
      password: dbType === 'postgres' ? process.env.DB_PASSWORD || 'postgres' : undefined,
      entities: [Exchange, ExchangePair, Signal, ArbitrageHistory, AlertLog, AnalyticsEvent, ScalpSignal, MasterSignal],
      synchronize: true, // Auto-sync structures for development ease
    }),
    ExchangesModule,
    ArbitrageModule,
    SignalsModule,
    AlertsModule,
    AnalyticsModule,
    ScalpModule,
    MasterAiModule,
  ],
})
export class AppModule {}
