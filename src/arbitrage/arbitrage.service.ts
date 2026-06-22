import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArbitrageHistory } from '../database/entities';
import { ExchangesService, TickerData } from '../exchanges/exchanges.service';
import { AlertsService } from '../alerts/alerts.service';

export interface ArbitrageOpportunity {
  id: string;
  coin: string;
  pair: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  grossSpreadPercent: number;
  netProfitPercent: number;
  network: string;
  transferTimeEstimate: string; // e.g. "5-10 mins"
  score: number; // 0-100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  lastVerified: string;
  capitalTiers: {
    capital: number;
    estimatedNetProfit: number;
  }[];
  steps: string[];
  aiConfidenceScore: number;
  aiPrediction: string;
  aiRiskDescription: string;
}

@Injectable()
export class ArbitrageService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ArbitrageService.name);
  private activeOpportunities: ArbitrageOpportunity[] = [];
  private onScanCallback: (() => void) | null = null;

  constructor(
    private readonly exchangesService: ExchangesService,
    private readonly alertsService: AlertsService,
    @InjectRepository(ArbitrageHistory)
    private readonly historyRepository: Repository<ArbitrageHistory>,
  ) {}

  async onApplicationBootstrap() {
    // Run an initial scan & calculation in the background after boot
    setTimeout(async () => {
      this.logger.log('Running initial boot market scan & calculation...');
      await this.exchangesService.scanMarketData();
      this.calculateOpportunities();
      if (this.onScanCallback) {
        this.onScanCallback();
      }
    }, 5000);
  }

  registerOnScanCallback(callback: () => void) {
    this.onScanCallback = callback;
  }

  /**
   * Periodic scheduler that runs the arbitrage engine
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleCronScan() {
    this.logger.log('Cron triggered: scanning exchanges and calculating arbitrage...');
    await this.exchangesService.scanMarketData();
    this.calculateOpportunities();
    if (this.onScanCallback) {
      this.onScanCallback();
    }
  }

  /**
   * Run calculations manually or programmatically
   */
  calculateOpportunities() {
    try {
      const tickers = this.exchangesService.getAllTickers();
      if (!tickers || Object.keys(tickers).length === 0) {
        this.logger.error('[SCANNER ERROR] No ticker data available from exchanges service. Arbitrage calculation aborted.');
        return;
      }

      const exchangesList = this.exchangesService.getExchangesList();
      const scanPairs = this.exchangesService.getScanPairs();
      const opportunities: ArbitrageOpportunity[] = [];

      for (const pair of scanPairs) {
        const coin = pair.split('/')[0];

        // Compare every permutation of two exchanges (Exchange A -> Buy, Exchange B -> Sell)
        for (const buyExch of exchangesList) {
          for (const sellExch of exchangesList) {
            if (buyExch === sellExch) continue;

            try {
              const buyTicker = tickers[buyExch]?.[pair];
              const sellTicker = tickers[sellExch]?.[pair];

              if (!buyTicker || !sellTicker) continue;

              // Buy at Ask price, Sell at Bid price
              const buyPrice = buyTicker.ask;
              const sellPrice = sellTicker.bid;

              if (buyPrice <= 0 || sellPrice <= 0) {
                this.logger.error(`[SCANNER ERROR] Invalid bid/ask prices for ${pair} on ${buyExch}/${sellExch}: buyPrice=${buyPrice}, sellPrice=${sellPrice}`);
                continue;
              }

              if (sellPrice <= buyPrice) continue;

              const grossSpreadPercent = ((sellPrice - buyPrice) / buyPrice) * 100;

              // Only evaluate spreads that are positive and reasonable (e.g. up to 15%)
              if (grossSpreadPercent > 0.05 && grossSpreadPercent < 15.0) {
                const opp = this.evaluateOpportunity(coin, pair, buyExch, sellExch, buyPrice, sellPrice, grossSpreadPercent);
                if (opp) {
                  opportunities.push(opp);
                  // Trigger Alert processing!
                  this.alertsService.processOpportunity(opp);
                }
              }
            } catch (calcErr) {
              this.logger.error(`[SCANNER ERROR] Failed to calculate opportunity for pair [${pair}] between [${buyExch}] and [${sellExch}]: ${calcErr.message}`);
            }
          }
        }
      }

      // Sort opportunities by Net Profit % and Score
      this.activeOpportunities = opportunities.sort((a, b) => b.netProfitPercent - a.netProfitPercent);
      this.logger.log(`Arbitrage calculation finished. Found ${this.activeOpportunities.length} opportunities.`);

      // Persist top opportunities to history
      this.persistTopOpportunities();
    } catch (globalErr) {
      this.logger.error(`[SCANNER CRASH] Critical error in calculateOpportunities: ${globalErr.message}`, globalErr.stack);
    }
  }

  private calculateAIConfidence(
    coin: string,
    buyExchange: string,
    sellExchange: string,
    grossSpreadPercent: number,
    network: string,
    transferTimeEstimate: string
  ): { score: number; prediction: string; risk: string } {
    let score = 100;

    // 1. Network Delay Penalty (long transfer time equals high probability of vanishing spread)
    if (network === 'BTC') {
      score -= 35;
    } else if (network === 'ERC20') {
      score -= 15;
    } else if (network === 'SOL' || network === 'TRC20') {
      score -= 0; // minimal delay risk
    }

    // 2. High Spread Volatility Penalty (massive spread usually represents locked wallets or bad tickers)
    if (grossSpreadPercent > 8.0) {
      score -= 40;
    } else if (grossSpreadPercent > 4.0) {
      score -= 20;
    }

    // 3. Minor Exchange Reputation Penalty
    const minorExchanges = ['LBANK', 'ASCENDEX', 'BINGX', 'GATEIO'];
    if (minorExchanges.includes(buyExchange.toUpperCase()) || minorExchanges.includes(sellExchange.toUpperCase())) {
      score -= 10;
    }

    score = Math.max(0, Math.min(100, score));

    // Formulate predictions
    let prediction = 'Stable opportunity for 3–6 minutes';
    let risk = 'Low';

    if (score < 40) {
      prediction = 'High risk of execution window expiry (< 1 min)';
      risk = 'High';
    } else if (score < 75) {
      prediction = 'Moderate execution window (2–3 minutes)';
      risk = 'Medium';
    }

    return {
      score,
      prediction,
      risk,
    };
  }

  private evaluateOpportunity(
    coin: string,
    pair: string,
    buyExchange: string,
    sellExchange: string,
    buyPrice: number,
    sellPrice: number,
    grossSpreadPercent: number
  ): ArbitrageOpportunity | null {
    // Get wallet fees & status
    const buyWallet = this.exchangesService.getWalletStatus(buyExchange, coin);
    const sellWallet = this.exchangesService.getWalletStatus(sellExchange, coin);

    // Flat network transfer fee in Coin unit
    const transferFeeInCoin = buyWallet.withdrawalFee;
    const transferFeeInUSDT = transferFeeInCoin * buyPrice;

    // Define trading fee percentages
    const buyFeePercent = 0.0010; // 0.1%
    const sellFeePercent = 0.0010; // 0.1%

    // Calculate net profits for capital tiers ($100, $500, $1000, $5000)
    const tiers = [100, 500, 1000, 5000];
    const capitalTiers = tiers.map((capital) => {
      const grossProfit = capital * (grossSpreadPercent / 100);
      const buyFee = capital * buyFeePercent;
      const sellFee = (capital + grossProfit) * sellFeePercent;
      
      const estimatedNetProfit = grossProfit - buyFee - sellFee - transferFeeInUSDT;
      return {
        capital,
        estimatedNetProfit: Number(estimatedNetProfit.toFixed(2)),
      };
    });

    // Use $1000 tier to represent the primary Net Profit %
    const primaryNetProfit = capitalTiers[2].estimatedNetProfit;
    const netProfitPercent = Number(((primaryNetProfit / 1000) * 100).toFixed(2));

    // Filters: We do not show opportunities with negative net profit at $1000 capital
    if (primaryNetProfit <= 0) return null;

    // Estimate network speed
    let transferTimeEstimate = '10-20 mins';
    if (buyWallet.network === 'SOL' || buyWallet.network === 'TRC20') {
      transferTimeEstimate = '2-5 mins';
    } else if (buyWallet.network === 'ERC20') {
      transferTimeEstimate = '5-15 mins';
    } else if (buyWallet.network === 'BTC') {
      transferTimeEstimate = '30-60 mins';
    }

    // Run AI Confidence calculations
    const aiDetails = this.calculateAIConfidence(
      coin,
      buyExchange,
      sellExchange,
      grossSpreadPercent,
      buyWallet.network,
      transferTimeEstimate
    );

    // Smart Filtering: filter out low confidence / fake / high-slippage trap spreads (confidence < 40)
    if (aiDetails.score < 40) {
      return null;
    }

    // Opportunity Score (0-100)
    let score = 0;
    // 1. Net Profit Weight (up to 50 points: 1% Net = 20 pts, 2.5%+ = 50 pts)
    score += Math.min(50, Math.round(netProfitPercent * 20));
    // 2. Wallets statuses (+30 points)
    if (buyWallet.withdrawalEnabled) score += 15;
    if (sellWallet.depositEnabled) score += 15;
    // 3. Network Speed Weight (+10 points)
    if (transferTimeEstimate === '2-5 mins') score += 10;
    else if (transferTimeEstimate === '5-15 mins') score += 7;
    else if (transferTimeEstimate === '10-20 mins') score += 5;
    else score += 2;
    // 4. Exchange Reputation Weight (+10 points)
    const topTier = ['binance', 'bybit', 'okx', 'kucoin'];
    if (topTier.includes(buyExchange.toLowerCase()) && topTier.includes(sellExchange.toLowerCase())) {
      score += 10;
    } else if (topTier.includes(buyExchange.toLowerCase()) || topTier.includes(sellExchange.toLowerCase())) {
      score += 6;
    } else {
      score += 3;
    }

    score = Math.min(100, score);

    // Risk Analysis
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (grossSpreadPercent > 7.0 || !buyWallet.withdrawalEnabled || !sellWallet.depositEnabled) {
      riskLevel = 'HIGH'; // Extremely high spread usually means wallet lock or API errors
    } else if (grossSpreadPercent > 3.0 || transferTimeEstimate === '30-60 mins') {
      riskLevel = 'MEDIUM';
    }

    // Unique Identifier
    const id = `${buyExchange}-${sellExchange}-${coin.toLowerCase()}-${Date.now()}`;

    // Step-by-Step Guide
    const steps = [
      `Buy ${coin} on ${buyExchange.toUpperCase()} at $${buyPrice.toFixed(4)}`,
      `Withdraw ${coin} from ${buyExchange.toUpperCase()} via ${buyWallet.network} network (Fee: ~${transferFeeInCoin} ${coin})`,
      `Deposit ${coin} into your ${sellExchange.toUpperCase()} wallet`,
      `Sell ${coin} on ${sellExchange.toUpperCase()} at $${sellPrice.toFixed(4)}`,
    ];

    return {
      id,
      coin,
      pair,
      buyExchange: buyExchange.toUpperCase(),
      sellExchange: sellExchange.toUpperCase(),
      buyPrice,
      sellPrice,
      grossSpreadPercent: Number(grossSpreadPercent.toFixed(2)),
      netProfitPercent,
      network: buyWallet.network,
      transferTimeEstimate,
      score,
      riskLevel,
      lastVerified: 'Just now',
      capitalTiers,
      steps,
      aiConfidenceScore: aiDetails.score,
      aiPrediction: aiDetails.prediction,
      aiRiskDescription: aiDetails.risk,
    };
  }

  private async persistTopOpportunities() {
    // Take the top 3 highest scoring opportunities from this run and log to DB history
    const topOpps = this.activeOpportunities.slice(0, 3);
    for (const opp of topOpps) {
      if (opp.score > 50) {
        try {
          const historyEntry = new ArbitrageHistory();
          historyEntry.coin = opp.coin;
          historyEntry.pair = opp.pair;
          historyEntry.buyExchange = opp.buyExchange;
          historyEntry.sellExchange = opp.sellExchange;
          historyEntry.buyPrice = opp.buyPrice;
          historyEntry.sellPrice = opp.sellPrice;
          historyEntry.grossSpreadPercent = opp.grossSpreadPercent;
          historyEntry.netProfitPercent = opp.netProfitPercent;
          historyEntry.volume24h = 500000; // estimated sample
          await this.historyRepository.save(historyEntry);
        } catch (err) {
          this.logger.error(`Failed to persist history: ${err.message}`);
        }
      }
    }
  }

  // Getters
  getActiveOpportunities(filters?: {
    minProfit?: number;
    minCapital?: number;
    exchange?: string;
    coin?: string;
    risk?: 'LOW' | 'MEDIUM' | 'HIGH';
  }): ArbitrageOpportunity[] {
    let list = [...this.activeOpportunities];

    if (filters) {
      if (filters.minProfit) {
        list = list.filter((o) => o.netProfitPercent >= filters.minProfit);
      }
      if (filters.exchange) {
        const target = filters.exchange.toUpperCase();
        list = list.filter((o) => o.buyExchange === target || o.sellExchange === target);
      }
      if (filters.coin) {
        list = list.filter((o) => o.coin.toUpperCase() === filters.coin.toUpperCase());
      }
      if (filters.risk) {
        list = list.filter((o) => o.riskLevel === filters.risk);
      }
    }

    return list;
  }

  async getTrendingOpportunities(): Promise<ArbitrageHistory[]> {
    // Fetch last 10 records from database
    return this.historyRepository.find({
      order: { timestamp: 'DESC' },
      take: 10,
    });
  }

  getFuturesArbitrage(): any[] {
    // Basis calculation (Spot vs perp contract) for key assets
    const results = [];
    const tickers = this.exchangesService.getAllTickers();
    const targets = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];

    for (const pair of targets) {
      const coin = pair.split('/')[0];
      for (const name of ['binance', 'bybit', 'okx']) {
        const ticker = tickers[name]?.[pair];
        if (ticker) {
          // Futures premium is simulated around +/- 0.15% base rate
          const seed = Math.sin(Date.now() / 90000 + name.length + coin.length);
          const premiumPct = seed * 0.0025; // -0.25% to +0.25%
          const spotPrice = ticker.last;
          const futuresPrice = spotPrice * (1 + premiumPct);
          const spreadPct = Number((premiumPct * 100).toFixed(3));

          results.push({
            coin,
            exchangeName: name.toUpperCase(),
            spotPrice: Number(spotPrice.toFixed(2)),
            futuresPrice: Number(futuresPrice.toFixed(2)),
            expectedProfit: Math.abs(spreadPct),
            fundingRate: Number((0.0001 * (seed > 0 ? 1 : -1) * 100).toFixed(4)), // standard funding %
            riskLevel: Math.abs(spreadPct) > 0.15 ? 'MEDIUM' : 'LOW',
            type: spreadPct > 0 ? 'Premium' : 'Discount',
          });
        }
      }
    }
    return results.sort((a, b) => b.expectedProfit - a.expectedProfit);
  }
}
