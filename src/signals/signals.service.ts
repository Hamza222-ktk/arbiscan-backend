import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Signal } from '../database/entities';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class SignalsService implements OnModuleInit {
  private readonly logger = new Logger(SignalsService.name);

  constructor(
    @InjectRepository(Signal)
    private readonly signalRepository: Repository<Signal>,
  ) {}

  async onModuleInit() {
    this.logger.log('Checking signals database status...');
    const count = await this.signalRepository.count();
    if (count === 0) {
      this.logger.log('Signals database is empty. Seeding initial signals...');
      await this.seedSignals();
    }
  }

  private async seedSignals() {
    const defaultSignals = [
      {
        coin: 'BTC/USDT',
        direction: 'LONG' as const,
        entryPrice: 99500,
        targets: [101000, 103000, 105000],
        stopLoss: 97500,
        risk: 'LOW' as const,
        status: 'ACTIVE' as const,
        entryReason: 'Strong support bounce on the 4-hour EMA ribbon with high volume.',
        createdAt: new Date(Date.now() - 3600000), // 1 hour ago
      },
      {
        coin: 'ETH/USDT',
        direction: 'LONG' as const,
        entryPrice: 3450,
        targets: [3520, 3580, 3650],
        stopLoss: 3380,
        risk: 'MEDIUM' as const,
        status: 'TARGET_HIT' as const,
        entryReason: 'RSI divergence breakout coupled with whale accumulation metrics.',
        createdAt: new Date(Date.now() - 12 * 3600000), // 12 hours ago
      },
      {
        coin: 'SOL/USDT',
        direction: 'SHORT' as const,
        entryPrice: 188.50,
        targets: [182.00, 178.00, 175.00],
        stopLoss: 194.00,
        risk: 'HIGH' as const,
        status: 'STOPPED_OUT' as const,
        entryReason: 'Overbought status on daily timeframe and resistance rejection.',
        createdAt: new Date(Date.now() - 24 * 3600000), // 1 day ago
      },
      {
        coin: 'XRP/USDT',
        direction: 'LONG' as const,
        entryPrice: 1.05,
        targets: [1.12, 1.18, 1.25],
        stopLoss: 0.99,
        risk: 'MEDIUM' as const,
        status: 'EXPIRED' as const,
        entryReason: 'Volume spike and consolidation breakout.',
        createdAt: new Date(Date.now() - 48 * 3600000), // 2 days ago
      },
      {
        coin: 'DOGE/USDT',
        direction: 'LONG' as const,
        entryPrice: 0.142,
        targets: [0.155, 0.165, 0.180],
        stopLoss: 0.131,
        risk: 'HIGH' as const,
        status: 'ACTIVE' as const,
        entryReason: 'Social volume spike and dynamic trendline support retest.',
        createdAt: new Date(Date.now() - 2 * 3600000), // 2 hours ago
      }
    ];

    for (const sigData of defaultSignals) {
      const sig = new Signal();
      sig.coin = sigData.coin;
      sig.direction = sigData.direction;
      sig.entryPrice = sigData.entryPrice;
      sig.targets = sigData.targets;
      sig.stopLoss = sigData.stopLoss;
      sig.risk = sigData.risk;
      sig.status = sigData.status;
      sig.entryReason = sigData.entryReason;
      sig.createdAt = sigData.createdAt;
      await this.signalRepository.save(sig);
    }
    this.logger.log('Initial signals successfully seeded.');
  }

  /**
   * Periodic scheduler to simulate signal updates (hitting targets, etc.) for app dynamism
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async simulateSignalUpdates() {
    this.logger.log('Simulating signal price updates...');
    const active = await this.signalRepository.find({ where: { status: 'ACTIVE' } });
    for (const sig of active) {
      const roll = Math.random();
      if (roll < 0.15) {
        sig.status = 'TARGET_HIT';
        sig.entryReason += ' [Update: Target 1 Hit successfully]';
        await this.signalRepository.save(sig);
        this.logger.log(`Signal for ${sig.coin} updated to TARGET_HIT`);
      } else if (roll < 0.25) {
        sig.status = 'STOPPED_OUT';
        await this.signalRepository.save(sig);
        this.logger.log(`Signal for ${sig.coin} updated to STOPPED_OUT`);
      }
    }
  }

  async getSignals(status?: 'ACTIVE' | 'TARGET_HIT' | 'STOPPED_OUT' | 'EXPIRED') {
    if (status) {
      return this.signalRepository.find({
        where: { status },
        order: { createdAt: 'DESC' },
      });
    }
    return this.signalRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async getStats() {
    const total = await this.signalRepository.count();
    const active = await this.signalRepository.count({ where: { status: 'ACTIVE' } });
    const winners = await this.signalRepository.count({ where: { status: 'TARGET_HIT' } });
    const stopped = await this.signalRepository.count({ where: { status: 'STOPPED_OUT' } });
    const expired = await this.signalRepository.count({ where: { status: 'EXPIRED' } });

    const winRate = total > active ? Math.round((winners / (total - active)) * 100) : 0;

    return {
      activeSignals: active,
      winningSignals: winners,
      closedSignals: stopped + expired + winners,
      totalSignals: total,
      winRate: `${winRate}%`,
      recentActivity: `${active} active calls monitoring market feeds.`
    };
  }

  async getSignalById(id: number) {
    return this.signalRepository.findOne({ where: { id } });
  }
}
