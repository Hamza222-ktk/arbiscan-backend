import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertLog } from '../database/entities';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private recentAlertHashes = new Set<string>();
  private onAlertCallback: ((alert: AlertLog) => void) | null = null;

  constructor(
    @InjectRepository(AlertLog)
    private readonly alertLogRepository: Repository<AlertLog>,
  ) {}

  registerOnAlertCallback(callback: (alert: AlertLog) => void) {
    this.onAlertCallback = callback;
  }

  /**
   * Processes a newly computed arbitrage opportunity and decides whether to trigger an alert
   */
  async processOpportunity(opp: any) {
    const coin = opp.coin;
    const buyExch = opp.buyExchange;
    const sellExch = opp.sellExchange;
    const profit = opp.netProfitPercent;
    const score = opp.score;

    // 1. Deduplication key (combines coin, exchanges and a 1-minute window hash)
    const timeBucket = Math.floor(Date.now() / 60000);
    const hash = `${coin}-${buyExch}-${sellExch}-${timeBucket}`;

    if (this.recentAlertHashes.has(hash)) {
      // Already alerted for this spread in the current minute
      return;
    }

    // Add to deduplication set
    this.recentAlertHashes.add(hash);
    // Cleanup old hashes periodically
    setTimeout(() => this.recentAlertHashes.delete(hash), 65000);

    // 2. Filter Alert Criteria
    if (score < 70) {
      // Skip alerts below threshold
      return;
    }

    // 3. Determine priority levels
    let priority: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
    let title = `🚀 Profitable Arbitrage: ${coin}`;
    
    if (score >= 85 && profit >= 1.0) {
      priority = 'HIGH';
      title = `🔴 Premium Alert: ${coin} (+${profit}% Net)`;
    } else if (score < 60) {
      priority = 'LOW';
      title = `🟢 Low Priority Arbitrage: ${coin}`;
    }

    const message = `Buy on ${buyExch} ($${opp.buyPrice}) and sell on ${sellExch} ($${opp.sellPrice}). Estimated net profit: ${profit}%. Network: ${opp.network}.`;

    // 4. Create and persist alert
    await this.triggerAlert('ARBITRAGE', coin, priority, title, message, score, opp);
  }

  /**
   * Manually trigger alert (for funding rate deviations or sudden price spikes)
   */
  async triggerAlert(
    type: string,
    coin: string,
    priority: 'HIGH' | 'MEDIUM' | 'LOW',
    title: string,
    message: string,
    score: number,
    data: any
  ) {
    try {
      const alert = new AlertLog();
      alert.type = type;
      alert.coin = coin;
      alert.priority = priority;
      alert.title = title;
      alert.message = message;
      alert.score = score;
      alert.data = data;

      const saved = await this.alertLogRepository.save(alert);
      this.logger.log(`[ALERT TRIGGERED - ${priority}] ${title}`);

      // Push alert to clients via WebSockets callback
      if (this.onAlertCallback) {
        this.onAlertCallback(saved);
      }
    } catch (err) {
      this.logger.error(`Failed to save and fire alert: ${err.message}`);
    }
  }

  async getLiveAlerts(limit = 30): Promise<AlertLog[]> {
    return this.alertLogRepository.find({
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  async clearHistory(): Promise<void> {
    await this.alertLogRepository.clear();
    this.logger.log('Alert history logs successfully cleared.');
  }
}
