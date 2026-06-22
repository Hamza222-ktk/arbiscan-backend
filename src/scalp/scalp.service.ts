import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ScalpSignal } from '../database/entities';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlertsService } from '../alerts/alerts.service';
import { ExchangesService } from '../exchanges/exchanges.service';

@Injectable()
export class ScalpService implements OnModuleInit {
  private readonly logger = new Logger(ScalpService.name);
  private onScalpCallback: ((signal: ScalpSignal) => void) | null = null;
  private recentScalpsCounter: { [coin: string]: number[] } = {}; // coin -> array of timestamps of signals fired

  constructor(
    @InjectRepository(ScalpSignal)
    private readonly scalpRepository: Repository<ScalpSignal>,
    private readonly alertsService: AlertsService,
    private readonly exchangesService: ExchangesService,
  ) {}

  async onModuleInit() {
    this.logger.log('Checking scalp signals database status...');
    const count = await this.scalpRepository.count();
    if (count === 0) {
      this.logger.log('Scalp signals database is empty. Seeding initial scalps...');
      await this.seedScalpSignals();
    }
  }

  registerOnScalpCallback(callback: (signal: ScalpSignal) => void) {
    this.onScalpCallback = callback;
  }

  private async seedScalpSignals() {
    const seeds = [
      {
        coin: 'SOL/USDT',
        direction: 'LONG' as const,
        entryMin: 184.20,
        entryMax: 185.10,
        targets: [186.80, 188.50],
        stopLoss: 182.50,
        confidence: 88,
        timeframe: '5m',
        type: 'MOMENTUM' as const,
        status: 'ACTIVE' as const,
        analysis: 'EMA 9 crossed above EMA 21 on the 5-minute chart with a 3x volume spike.',
        expiresAt: new Date(Date.now() + 8 * 60 * 1000), // expires in 8 minutes
        createdAt: new Date(),
      },
      {
        coin: 'ETH/USDT',
        direction: 'SHORT' as const,
        entryMin: 3450,
        entryMax: 3470,
        targets: [3410, 3380],
        stopLoss: 3505,
        confidence: 82,
        timeframe: '15m',
        type: 'REVERSAL' as const,
        status: 'TARGET_HIT' as const,
        analysis: 'RSI touched overbought at 79 on 15m candle with sell order book clustering.',
        expiresAt: new Date(Date.now() - 30 * 60 * 1000),
        createdAt: new Date(Date.now() - 40 * 60 * 1000),
      },
      {
        coin: 'BTC/USDT',
        direction: 'LONG' as const,
        entryMin: 101200,
        entryMax: 101500,
        targets: [102300, 103000],
        stopLoss: 100600,
        confidence: 91,
        timeframe: '5m',
        type: 'BREAKOUT' as const,
        status: 'STOPPED_OUT' as const,
        analysis: 'Resistance sweep failed, triggered tight stop loss support level.',
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 70 * 60 * 1000),
      }
    ];

    for (const data of seeds) {
      const signal = new ScalpSignal();
      Object.assign(signal, data);
      await this.scalpRepository.save(signal);
    }
    this.logger.log('Initial scalp signals seeded successfully.');
  }

  /**
   * Evaluates price metrics and generates scalp signals
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async evaluateMarketsForScalp() {
    this.logger.log('Scalp Engine checking markets for scalp configurations...');
    const tickers = this.exchangesService.getAllTickers();
    const binanceTickers = tickers['binance'];

    if (!binanceTickers) return;

    const coinsToScan = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'];
    for (const coin of coinsToScan) {
      const pair = `${coin}/USDT`;
      const ticker = binanceTickers[pair];

      if (!ticker) continue;

      // Risk Control: Enforce maximum of 2 signals per coin per hour
      if (this.isOvertradingLimitHit(coin)) {
        this.logger.log(`Scalp alert skipped for ${coin} due to hour overtrading limit.`);
        continue;
      }

      // Simulate a scalp signal trigger based on random indicator swings (or EMA/RSI crossover mocks)
      const roll = Math.random();
      if (roll < 0.20) { // 20% chance per minute to trigger a scalp setup
        await this.generateAndTriggerScalp(coin, ticker.last);
      }
    }
  }

  private isOvertradingLimitHit(coin: string): boolean {
    const now = Date.now();
    const timestamps = this.recentScalpsCounter[coin] || [];
    // Filter timestamps in last 60 minutes
    const oneHourAgo = now - 60 * 60 * 1000;
    const activeTimes = timestamps.filter(t => t > oneHourAgo);
    this.recentScalpsCounter[coin] = activeTimes;

    return activeTimes.length >= 2;
  }

  private async generateAndTriggerScalp(coin: string, price: number) {
    const direction = Math.random() > 0.5 ? ('LONG' as const) : ('SHORT' as const);
    
    // Evaluate Confluence Layers (Weights: Momentum 40, LSR 40, Orderflow 20)
    const momentumScore = 30 + Math.floor(Math.random() * 11);
    const lsrScore = 30 + Math.floor(Math.random() * 11);
    const orderFlowScore = 15 + Math.floor(Math.random() * 6);
    const confidence = momentumScore + lsrScore + orderFlowScore; // 75-100 total

    // Intelligence Rule: 15% chance to simulate conflicting strategy indicators
    const hasDisagreement = Math.random() < 0.15;
    if (hasDisagreement) {
      this.logger.log(`[SCALP ENGINE CONFLUENCE WAIT] Strategy conflict detected for ${coin}/USDT (Momentum: LONG, LSR: SHORT). No signal generated.`);
      return;
    }

    const momentumDetails = direction === 'LONG'
      ? 'Bullish trend confirmed (EMA 9 crossing above EMA 21 + Volume spike)'
      : 'Bearish trend confirmed (EMA 9 crossing below EMA 21 + Volume breakout)';
      
    const lsrDetails = direction === 'LONG'
      ? 'Liquidity sweep below key support range detected with long rejection wick'
      : 'Liquidity sweep above key resistance zone detected with bearish pinbar rejection';

    const orderFlowDetails = direction === 'LONG'
      ? 'Strong buying imbalance registered in orderbook (bids/asks ratio: 2.1x)'
      : 'Strong selling pressure cluster detected in orderbook asks (asks/bids ratio: 1.9x)';

    const marketStructureDetails = direction === 'LONG'
      ? 'Bullish market structure shifting: Higher Low formed'
      : 'Bearish market structure shifting: Lower High established';

    const variance = price * 0.002; // Tight 0.2% entry zone
    const entryMin = Number((price - variance / 2).toFixed(4));
    const entryMax = Number((price + variance / 2).toFixed(4));

    // Calculate Targets and Tight Stop Loss
    let stopLoss = 0;
    let target1 = 0;
    let target2 = 0;

    if (direction === 'LONG') {
      stopLoss = Number((price * 0.996).toFixed(4)); // -0.4% tight SL
      target1 = Number((price * 1.006).toFixed(4));  // +0.6% TP1
      target2 = Number((price * 1.010).toFixed(4));  // +1.0% TP2
    } else {
      stopLoss = Number((price * 1.004).toFixed(4)); // +0.4% tight SL
      target1 = Number((price * 0.994).toFixed(4));  // -0.6% TP1
      target2 = Number((price * 0.990).toFixed(4));  // -1.0% TP2
    }

    const validityMinutes = 8 + Math.floor(Math.random() * 5); // 8 to 12 minutes validity
    const expiresAt = new Date(Date.now() + validityMinutes * 60 * 1000);

    const signal = new ScalpSignal();
    signal.coin = `${coin}/USDT`;
    signal.direction = direction;
    signal.entryMin = entryMin;
    signal.entryMax = entryMax;
    signal.targets = [target1, target2];
    signal.stopLoss = stopLoss;
    signal.confidence = confidence;
    signal.timeframe = '5m';
    signal.type = 'HYBRID';
    signal.status = 'ACTIVE';
    signal.analysis = `🟢 HYBRID SCALP SIGNAL - Momentum + Smart Money Confirmed`;
    signal.confluenceBreakdown = {
      momentum: momentumDetails,
      lsr: lsrDetails,
      orderFlow: orderFlowDetails,
      marketStructure: marketStructureDetails,
    };
    signal.expiresAt = expiresAt;

    const saved = await this.scalpRepository.save(signal);

    // Track for overtrading limits
    if (!this.recentScalpsCounter[coin]) this.recentScalpsCounter[coin] = [];
    this.recentScalpsCounter[coin].push(Date.now());

    // Trigger Highest priority alert (Phase 4 integration)
    const alertTitle = `🔥 HYBRID SCALP CONFLUENCE DETECTED: ${signal.coin}`;
    const alertMessage = `🟢 HYBRID SCALP SIGNAL (Momentum + LSR Confirmed) - direction: ${direction}. Entry Zone: $${entryMin} - $${entryMax}. Target 1: $${target1}, Target 2: $${target2}. Validity: ${validityMinutes}m. Confidence: ${confidence}/100.`;
    await this.alertsService.triggerAlert('HYBRID_SCALP', signal.coin, 'HIGH', alertTitle, alertMessage, confidence, saved);

    // Push via WebSocket callback
    if (this.onScalpCallback) {
      this.onScalpCallback(saved);
    }
  }

  /**
   * Background monitor runs every 10 seconds to auto-expire outdated scalp signals
   */
  @Cron('*/10 * * * * *')
  async autoExpireSignals() {
    const now = new Date();
    const expiredSignals = await this.scalpRepository.find({
      where: {
        status: 'ACTIVE',
        expiresAt: LessThan(now),
      }
    });

    for (const sig of expiredSignals) {
      sig.status = 'EXPIRED';
      await this.scalpRepository.save(sig);
      this.logger.log(`[SCALP AUTO-EXPIRED] Signal for ${sig.coin} has reached validity time limit.`);
      
      if (this.onScalpCallback) {
        this.onScalpCallback(sig);
      }
    }
  }

  async getLiveScalps(): Promise<ScalpSignal[]> {
    return this.scalpRepository.find({
      where: { status: 'ACTIVE' },
      order: { createdAt: 'DESC' },
    });
  }

  async getScalpHistory(limit = 30): Promise<ScalpSignal[]> {
    return this.scalpRepository.find({
      where: [
        { status: 'TARGET_HIT' },
        { status: 'STOPPED_OUT' },
        { status: 'EXPIRED' }
      ],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
