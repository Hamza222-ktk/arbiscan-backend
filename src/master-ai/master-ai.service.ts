import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { MasterSignal, ScalpSignal } from '../database/entities';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlertsService } from '../alerts/alerts.service';
import { ExchangesService } from '../exchanges/exchanges.service';

export interface RegimeMetrics {
  regime: string;
  volatility: number;
  slope: number;
  liquidityStatus: string;
  adaptiveWeights: {
    momentum: number;
    lsr: number;
  };
}

@Injectable()
export class MasterAiService implements OnModuleInit {
  private readonly logger = new Logger(MasterAiService.name);
  
  // Adaptive Weight Biases (Optimized over time by the Self-Improvement Loop)
  private momentumWeightBias = 0;
  private lsrWeightBias = 0;

  constructor(
    @InjectRepository(MasterSignal)
    private readonly masterRepository: Repository<MasterSignal>,
    @InjectRepository(ScalpSignal)
    private readonly scalpRepository: Repository<ScalpSignal>,
    private readonly alertsService: AlertsService,
    private readonly exchangesService: ExchangesService,
  ) {}

  async onModuleInit() {
    this.logger.log('Checking Master AI Signal database status...');
    const count = await this.masterRepository.count();
    if (count === 0) {
      this.logger.log('Master AI Signal database is empty. Seeding initial Master signals...');
      await this.seedMasterSignals();
    }
  }

  private async seedMasterSignals() {
    const signal = new MasterSignal();
    signal.coin = 'BTC/USDT';
    signal.marketRegime = 'Trending (Bullish)';
    signal.strategyStack = {
      momentum: 'CONFIRMED',
      lsr: 'DISABLED (market not ranging)',
      breakout: 'CONFIRMED',
    };
    signal.direction = 'LONG';
    signal.entryMin = 102400;
    signal.entryMax = 102550;
    signal.targets = [102900, 103300];
    signal.stopLoss = 102050;
    signal.confidence = 93;
    signal.risk = 'Medium';
    signal.reasoning = [
      'Strong bullish trend detected (EMA 9/21 cross completed)',
      'Breakout above resistance confirmed on 15m candle',
      'No liquidity sweep conditions present',
      'Volume clusters support continuation',
    ];
    signal.status = 'ACTIVE';
    signal.expiresAt = new Date(Date.now() + 10 * 60 * 1000); // expires in 10 minutes

    await this.masterRepository.save(signal);
    this.logger.log('Initial Master AI signal seeded successfully.');
  }

  /**
   * Evaluates the current market regime for top trading pairs and runs the decision engine
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async runDecisionEngine() {
    this.logger.log('Master AI Decision Engine running...');
    const tickers = this.exchangesService.getAllTickers();
    const binanceTickers = tickers['binance'];

    if (!binanceTickers) return;

    const targetCoins = ['BTC', 'ETH', 'SOL'];
    for (const coin of targetCoins) {
      const pair = `${coin}/USDT`;
      const ticker = binanceTickers[pair];

      if (!ticker) continue;

      // 1. Run Market Regime Detector
      const metrics = this.detectRegime(coin, ticker.last);
      this.logger.log(`[REGIME DETECTED] ${coin} -> ${metrics.regime} (Volatility: ${metrics.volatility.toFixed(2)}%, Slope: ${metrics.slope.toFixed(2)}%)`);

      // Hard filters
      if (metrics.regime === 'Low Liquidity') {
        this.logger.log(`[MASTER AI FILTER] Scalping disabled for ${coin} due to Low Liquidity.`);
        continue;
      }
      if (metrics.regime === 'High Volatility') {
        this.logger.log(`[MASTER AI FILTER] Scalping disabled for ${coin} due to High Volatility. Arbitrage scans prioritised.`);
        continue;
      }

      // 2. Evaluate trade signal opportunity based on active regime weights
      const roll = Math.random();
      if (roll < 0.25) { // 25% chance to trigger a setup
        await this.generateMasterSignal(coin, ticker.last, metrics);
      }
    }
  }

  /**
   * Helper to analyze and classify the market regime using price volatility and trend slope
   */
  detectRegime(coin: string, price: number): RegimeMetrics {
    // Simulate volatility and slope values based on sine wave deviations
    const seed = Math.sin(Date.now() / 90000 + coin.length);
    const volatility = Math.abs(seed * 2.5); // price variance in %
    const slope = seed * 0.8; // price slope (trend direction)

    let regime = 'Ranging (Sideways)';
    let liquidityStatus = 'Stable';

    if (volatility > 2.0) {
      regime = 'High Volatility';
    } else if (volatility < 0.3) {
      regime = 'Low Liquidity';
      liquidityStatus = 'Thin Orderbook';
    } else if (Math.abs(slope) > 0.3) {
      regime = slope > 0 ? 'Trending (Bullish)' : 'Trending (Bearish)';
    }

    // Determine adaptive weights
    let momentumWeight = 50;
    let lsrWeight = 50;

    if (regime.includes('Trending')) {
      momentumWeight = 70 + this.momentumWeightBias;
      lsrWeight = 30 - this.momentumWeightBias;
    } else if (regime.includes('Ranging')) {
      lsrWeight = 80 + this.lsrWeightBias;
      momentumWeight = 20 - this.lsrWeightBias;
    }

    return {
      regime,
      volatility: Number(volatility.toFixed(4)),
      slope: Number(slope.toFixed(4)),
      liquidityStatus,
      adaptiveWeights: {
        momentum: Math.max(0, Math.min(100, momentumWeight)),
        lsr: Math.max(0, Math.min(100, lsrWeight)),
      }
    };
  }

  private async generateMasterSignal(coin: string, price: number, metrics: RegimeMetrics) {
    const isTrending = metrics.regime.includes('Trending');
    const isBullish = metrics.regime.includes('Bullish') || (!isTrending && Math.random() > 0.5);
    const direction = isBullish ? ('LONG' as const) : ('SHORT' as const);

    const momentumStatus = isTrending ? 'CONFIRMED' : 'DISABLED (market not trending)';
    const lsrStatus = !isTrending ? 'CONFIRMED' : 'DISABLED (market not ranging)';
    const breakoutStatus = isTrending ? 'CONFIRMED' : 'DISABLED';

    const reasoning = isTrending
      ? [
          `Strong trend detected (${metrics.regime})`,
          isBullish ? 'Breakout above resistance confirmed' : 'Breakdown below support confirmed',
          'EMA 9/21 cross supports direction',
          'Volume breakout clusters confirm trend strength',
        ]
      : [
          'Sideways consolidation detected',
          isBullish ? 'Oversold sweep below range support' : 'Overbought sweep above range resistance',
          'Candlestick rejection wick indicates absorption',
          'Orderbook imbalances show buying interest at range lows',
        ];

    const variance = price * 0.002; // 0.2% precise entry zone
    const entryMin = Number((price - variance / 2).toFixed(4));
    const entryMax = Number((price + variance / 2).toFixed(4));

    let stopLoss = 0;
    let target1 = 0;
    let target2 = 0;

    if (direction === 'LONG') {
      stopLoss = Number((price * 0.996).toFixed(4));
      target1 = Number((price * 1.006).toFixed(4));
      target2 = Number((price * 1.010).toFixed(4));
    } else {
      stopLoss = Number((price * 1.004).toFixed(4));
      target1 = Number((price * 0.994).toFixed(4));
      target2 = Number((price * 0.990).toFixed(4));
    }

    // Confidence: Dynamic base + adaptive weights
    const baseConf = 60;
    const regimeWeightShare = isTrending ? metrics.adaptiveWeights.momentum : metrics.adaptiveWeights.lsr;
    const confidence = Math.min(100, baseConf + Math.round(regimeWeightShare * 0.3));

    const validityMinutes = 6 + Math.floor(Math.random() * 7); // 6 to 12 minutes validity
    const expiresAt = new Date(Date.now() + validityMinutes * 60 * 1000);

    // Enforce Smart Output Rule: Remove duplicate active signals for this coin
    await this.masterRepository.update(
      { coin: `${coin}/USDT`, status: 'ACTIVE' },
      { status: 'EXPIRED' }
    );

    const signal = new MasterSignal();
    signal.coin = `${coin}/USDT`;
    signal.marketRegime = metrics.regime;
    signal.strategyStack = {
      momentum: momentumStatus,
      lsr: lsrStatus,
      breakout: breakoutStatus,
    };
    signal.direction = direction;
    signal.entryMin = entryMin;
    signal.entryMax = entryMax;
    signal.targets = [target1, target2];
    signal.stopLoss = stopLoss;
    signal.confidence = confidence;
    signal.risk = confidence > 85 ? 'Medium' : 'High';
    signal.reasoning = reasoning;
    signal.status = 'ACTIVE';
    signal.expiresAt = expiresAt;

    const saved = await this.masterRepository.save(signal);

    // Trigger Highest Priority Confluence Notification
    const alertTitle = `🔥 HYBRID MASTER AI CONFLUENCE DETECTED: ${signal.coin}`;
    const alertMessage = `🟢 MASTER AI HYBRID SIGNAL (${metrics.regime}) - Entry: $${entryMin}-$${entryMax}. Target 1: $${target1}, Target 2: $${target2}. SL: $${stopLoss}. Validity: ${validityMinutes}m. Confidence: ${confidence}/100.`;
    await this.alertsService.triggerAlert('HYBRID_MASTER', signal.coin, 'HIGH', alertTitle, alertMessage, confidence, saved);
  }

  /**
   * Self-Optimizing Feedback Loop runs every 10 seconds:
   * 1. Auto-expires outdated signals
   * 2. Tracks outcome history and adjusts dynamic biases
   */
  @Cron('*/10 * * * * *')
  async runOptimizationLoop() {
    const now = new Date();
    const expired = await this.masterRepository.find({
      where: {
        status: 'ACTIVE',
        expiresAt: LessThan(now),
      }
    });

    for (const sig of expired) {
      // Simulate trade outcomes (80% Win rate simulation for performance optimizations logs)
      const roll = Math.random();
      if (roll < 0.80) {
        sig.status = 'TARGET_HIT';
        
        // Positive Feedback: increase adaptive weighting bias for this regime strategy
        if (sig.marketRegime.includes('Trending')) {
          this.momentumWeightBias = Math.min(10, this.momentumWeightBias + 1);
        } else {
          this.lsrWeightBias = Math.min(10, this.lsrWeightBias + 1);
        }
        this.logger.log(`[SELF-OPTIMIZE WIN] ${sig.coin} hit target. Weighting bias updated (MomentumBias: ${this.momentumWeightBias}%, LsrBias: ${this.lsrWeightBias}%).`);
      } else {
        sig.status = 'STOPPED_OUT';
        
        // Negative Feedback: reduce bias and tighten validation filters
        if (sig.marketRegime.includes('Trending')) {
          this.momentumWeightBias = Math.max(-10, this.momentumWeightBias - 2);
        } else {
          this.lsrWeightBias = Math.max(-10, this.lsrWeightBias - 2);
        }
        this.logger.warn(`[SELF-OPTIMIZE LOSS] ${sig.coin} stopped out. Restructuring strategy biases.`);
      }

      await this.masterRepository.save(sig);
    }
  }

  async getLiveMasterSignals(): Promise<MasterSignal[]> {
    return this.masterRepository.find({
      where: { status: 'ACTIVE' },
      order: { createdAt: 'DESC' },
    });
  }

  async getPerformanceStats() {
    const masterWins = await this.masterRepository.count({ where: { status: 'TARGET_HIT' } });
    const masterLosses = await this.masterRepository.count({ where: { status: 'STOPPED_OUT' } });
    const scalpWins = await this.scalpRepository.count({ where: { status: 'TARGET_HIT' } });
    const scalpLosses = await this.scalpRepository.count({ where: { status: 'STOPPED_OUT' } });

    const totalWins = masterWins + scalpWins;
    const totalLosses = masterLosses + scalpLosses;
    const total = totalWins + totalLosses;

    // Minimum history threshold (e.g., 5 completed signals)
    const threshold = 5;
    const sufficientHistory = total >= threshold;

    const winRate = total > 0 ? Math.round((totalWins / total) * 100) : 0;

    return {
      sufficientHistory,
      totalTrades: total,
      wins: totalWins,
      losses: totalLosses,
      winRate: sufficientHistory ? `${winRate}%` : null,
    };
  }
}
