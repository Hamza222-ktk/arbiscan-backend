import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('exchanges')
export class Exchange {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  logoUrl: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('exchange_pairs')
export class ExchangePair {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  exchangeName: string;

  @Column()
  symbol: string; // e.g. "BTC/USDT"

  @Column()
  baseAsset: string; // e.g. "BTC"

  @Column()
  quoteAsset: string; // e.g. "USDT"

  @Column({ default: true })
  depositEnabled: boolean;

  @Column({ default: true })
  withdrawalEnabled: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0.0010 })
  buyFeePercent: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0.0010 })
  sellFeePercent: number;

  @Column({ type: 'decimal', precision: 16, scale: 8, default: 0.0 })
  withdrawalFeeFlat: number;

  @Column({ nullable: true })
  networkName: string; // e.g. "TRC20"

  @UpdateDateColumn()
  lastVerifiedAt: Date;
}

@Entity('signals')
export class Signal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  coin: string; // e.g. "ETH"

  @Column()
  direction: 'LONG' | 'SHORT';

  @Column({ type: 'decimal', precision: 16, scale: 8 })
  entryPrice: number;

  @Column({ type: 'simple-json' })
  targets: number[]; // e.g. [106000, 107000]

  @Column({ type: 'decimal', precision: 16, scale: 8 })
  stopLoss: number;

  @Column()
  risk: 'LOW' | 'MEDIUM' | 'HIGH';

  @Column({ default: 'ACTIVE' })
  status: 'ACTIVE' | 'TARGET_HIT' | 'STOPPED_OUT' | 'EXPIRED';

  @Column({ type: 'text', nullable: true })
  entryReason: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('arbitrage_history')
export class ArbitrageHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  coin: string;

  @Column()
  pair: string;

  @Column()
  buyExchange: string;

  @Column()
  sellExchange: string;

  @Column({ type: 'decimal', precision: 16, scale: 8 })
  buyPrice: number;

  @Column({ type: 'decimal', precision: 16, scale: 8 })
  sellPrice: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  grossSpreadPercent: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  netProfitPercent: number;

  @Column({ type: 'decimal', precision: 16, scale: 2, nullable: true })
  volume24h: number;

  @CreateDateColumn()
  timestamp: Date;
}

@Entity('alert_logs')
export class AlertLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  type: string; // e.g. "ARBITRAGE" | "PRICE_SPIKE" | "FUNDING_RATE"

  @Column()
  coin: string;

  @Column()
  priority: 'HIGH' | 'MEDIUM' | 'LOW';

  @Column()
  title: string;

  @Column()
  message: string;

  @Column({ default: 0 })
  score: number;

  @Column({ type: 'simple-json', nullable: true })
  data: any;

  @CreateDateColumn()
  timestamp: Date;
}

@Entity('analytics_events')
export class AnalyticsEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  eventType: string; // e.g. "AD_IMPRESSION", "CTR_CLICK", "SCREEN_VIEW"

  @Column({ nullable: true })
  deviceUuid: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: any;

  @CreateDateColumn()
  timestamp: Date;
}

@Entity('scalp_signals')
export class ScalpSignal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  coin: string;

  @Column()
  direction: 'LONG' | 'SHORT';

  @Column({ type: 'decimal', precision: 16, scale: 8 })
  entryMin: number;

  @Column({ type: 'decimal', precision: 16, scale: 8 })
  entryMax: number;

  @Column({ type: 'simple-json' })
  targets: number[];

  @Column({ type: 'decimal', precision: 16, scale: 8 })
  stopLoss: number;

  @Column()
  confidence: number;

  @Column()
  timeframe: string; // e.g. "5m" | "15m"

  @Column()
  type: 'MOMENTUM' | 'REVERSAL' | 'BREAKOUT' | 'HYBRID';

  @Column({ default: 'ACTIVE' })
  status: 'ACTIVE' | 'TARGET_HIT' | 'STOPPED_OUT' | 'EXPIRED';

  @Column({ type: 'text', nullable: true })
  analysis: string;

  @Column({ type: 'simple-json', nullable: true })
  confluenceBreakdown: {
    momentum: string;
    lsr: string;
    orderFlow: string;
    marketStructure: string;
  };

  @Column()
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('master_signals')
export class MasterSignal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  coin: string;

  @Column()
  marketRegime: string; // e.g. "Trending (Bullish)"

  @Column({ type: 'simple-json' })
  strategyStack: {
    momentum: string; // "CONFIRMED" | "DISABLED"
    lsr: string;      // "CONFIRMED" | "DISABLED"
    breakout: string; // "CONFIRMED" | "DISABLED"
  };

  @Column()
  direction: 'LONG' | 'SHORT';

  @Column({ type: 'decimal', precision: 16, scale: 8 })
  entryMin: number;

  @Column({ type: 'decimal', precision: 16, scale: 8 })
  entryMax: number;

  @Column({ type: 'simple-json' })
  targets: number[];

  @Column({ type: 'decimal', precision: 16, scale: 8 })
  stopLoss: number;

  @Column()
  confidence: number; // 0-100

  @Column()
  risk: string; // "Low" | "Medium" | "High"

  @Column({ type: 'simple-json' })
  reasoning: string[]; // List of bullet points

  @Column({ default: 'ACTIVE' })
  status: 'ACTIVE' | 'TARGET_HIT' | 'STOPPED_OUT' | 'EXPIRED';

  @Column()
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
