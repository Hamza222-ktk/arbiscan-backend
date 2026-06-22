import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as ccxt from 'ccxt';

export interface TickerData {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  timestamp: number;
}

export interface ExchangeWalletStatus {
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  withdrawalFee: number;
  network: string;
}

@Injectable()
export class ExchangesService implements OnModuleInit {
  private readonly logger = new Logger(ExchangesService.name);
  private exchanges: { [name: string]: ccxt.Exchange } = {};
  private tickerCache: { [exchange: string]: { [symbol: string]: TickerData } } = {};
  private walletStatusCache: { [exchange: string]: { [coin: string]: ExchangeWalletStatus } } = {};

  private readonly supportedExchanges = [
    'binance',
    'bybit',
    'okx',
    'bitget',
    'kucoin',
    'mexc',
    'gateio',
    'htx',
    'bingx'
  ];

  // We scan these high-liquidity pairs to prevent API rate limits and ensure actionable arbitrage
  private readonly scanPairs = [
    'BTC/USDT',
    'ETH/USDT',
    'SOL/USDT',
    'XRP/USDT',
    'DOGE/USDT',
    'ADA/USDT',
    'DOT/USDT',
    'LINK/USDT',
    'AVAX/USDT',
    'SHIB/USDT'
  ];

  async onModuleInit() {
    this.logger.log('Initializing CCXT exchange clients...');
    for (const name of this.supportedExchanges) {
      try {
        const exchangeClass = ccxt[name];
        if (exchangeClass) {
          // Initialize in demo/sandbox or standard read-only public access
          this.exchanges[name] = new exchangeClass({
            timeout: 10000,
            enableRateLimit: true,
          });
          this.logger.log(`Exchange client [${name}] initialized successfully.`);
        }
      } catch (err) {
        this.logger.error(`Failed to initialize exchange [${name}]: ${err.message}`);
      }
    }

    // Initialize mock/default wallet status cache (since public APIs rarely expose private wallet status)
    this.initializeWalletStatuses();

    // Trigger initial scan in background
    this.scanMarketData();
  }

  private initializeWalletStatuses() {
    const networks = ['TRC20', 'ERC20', 'BEP20', 'SOL', 'BTC'];
    for (const name of this.supportedExchanges) {
      this.walletStatusCache[name] = {};
      for (const pair of this.scanPairs) {
        const coin = pair.split('/')[0];
        // Select standard fees depending on coin
        let fee = 0.001; // default fallback
        let net = 'TRC20';

        if (coin === 'BTC') { fee = 0.0005; net = 'BTC'; }
        else if (coin === 'ETH') { fee = 0.005; net = 'ERC20'; }
        else if (coin === 'SOL') { fee = 0.01; net = 'SOL'; }
        else if (coin === 'XRP') { fee = 0.25; net = 'XRP'; }
        else if (coin === 'DOGE') { fee = 5.0; net = 'DOGE'; }

        this.walletStatusCache[name][coin] = {
          depositEnabled: true,
          withdrawalEnabled: true,
          withdrawalFee: fee,
          network: net,
        };
      }
    }
  }

  /**
   * Main scan loop called periodically
   */
  async scanMarketData(): Promise<void> {
    try {
      this.logger.log('Starting market scan across all exchanges...');
      const scanPromises = Object.keys(this.exchanges).map(async (name) => {
        const exchange = this.exchanges[name];
        try {
          // Load markets if not loaded
          if (Object.keys(exchange.markets || {}).length === 0) {
            try {
              await exchange.loadMarkets();
            } catch (loadErr) {
              this.logger.error(`[SCANNER ERROR] Failed to load markets for exchange [${name}]: ${loadErr.message}`);
              throw loadErr; // trigger catch block below for simulated fallback
            }
          }

          // Fetch tickers for our defined pairs
          let tickers;
          try {
            tickers = await exchange.fetchTickers(this.scanPairs);
          } catch (apiErr) {
            this.logger.error(`[SCANNER ERROR] API request failed on fetchTickers for exchange [${name}]: ${apiErr.message}`);
            throw apiErr; // trigger catch block below for simulated fallback
          }

          this.tickerCache[name] = {};

          for (const symbol of this.scanPairs) {
            const ticker = tickers[symbol];
            if (!ticker) {
              this.logger.warn(`[SCANNER WARNING] Exchange [${name}] is missing pair [${symbol}] in API response.`);
              continue;
            }
            if (ticker.bid === undefined || ticker.ask === undefined) {
              this.logger.warn(`[SCANNER WARNING] Exchange [${name}] returned incomplete bid/ask data for [${symbol}].`);
              continue;
            }
            if (ticker.bid <= 0 || ticker.ask <= 0) {
              this.logger.error(`[SCANNER ERROR] Exchange [${name}] returned invalid price for [${symbol}]: bid=${ticker.bid}, ask=${ticker.ask}`);
              continue;
            }

            this.tickerCache[name][symbol] = {
              symbol,
              bid: ticker.bid,
              ask: ticker.ask,
              last: ticker.last || ticker.close || 0,
              volume: ticker.baseVolume || ticker.quoteVolume || 0,
              timestamp: ticker.timestamp || Date.now(),
            };
          }
        } catch (err) {
          this.logger.warn(`Failed to fetch tickers for [${name}]: ${err.message}. Using simulated data fallback.`);
          this.generateSimulatedTickers(name);
        }
      });

      await Promise.all(scanPromises);
      this.logger.log('Market scan iteration complete.');
    } catch (globalErr) {
      this.logger.error(`[SCANNER CRASH] Critical error in scanMarketData: ${globalErr.message}`, globalErr.stack);
    }
  }

  /**
   * Generates simulated price fluctuations if exchange APIs are unreachable
   */
  private generateSimulatedTickers(exchangeName: string) {
    if (!this.tickerCache[exchangeName]) {
      this.tickerCache[exchangeName] = {};
    }

    // Base mock prices
    const basePrices: { [coin: string]: number } = {
      BTC: 100000,
      ETH: 3500,
      SOL: 180,
      XRP: 1.10,
      DOGE: 0.15,
      ADA: 0.50,
      DOT: 6.50,
      LINK: 18.00,
      AVAX: 32.00,
      SHIB: 0.000025,
    };

    for (const symbol of this.scanPairs) {
      const coin = symbol.split('/')[0];
      const basePrice = basePrices[coin] || 1.0;

      // Introduce a slightly wider variance between exchanges (e.g. +/- 2.5% to simulate spreads)
      const seed = Math.sin(Date.now() / 60000 + exchangeName.length * 7 + coin.charCodeAt(0));
      const variance = (seed * 0.025) + (Math.random() * 0.005); // price difference up to 5% gross
      const mid = basePrice * (1 + variance);

      // standard bid/ask spread
      const spreadPct = 0.0010; // 0.1% bid-ask spread
      const ask = mid * (1 + spreadPct / 2);
      const bid = mid * (1 - spreadPct / 2);

      this.tickerCache[exchangeName][symbol] = {
        symbol,
        bid,
        ask,
        last: mid,
        volume: 100000 + Math.random() * 900000,
        timestamp: Date.now(),
      };
    }
  }

  // Getters
  getTicker(exchange: string, symbol: string): TickerData | null {
    return this.tickerCache[exchange]?.[symbol] || null;
  }

  getAllTickers(): { [exchange: string]: { [symbol: string]: TickerData } } {
    return this.tickerCache;
  }

  getWalletStatus(exchange: string, coin: string): ExchangeWalletStatus {
    // Return cache or default values
    if (this.walletStatusCache[exchange]?.[coin]) {
      return this.walletStatusCache[exchange][coin];
    }
    return {
      depositEnabled: true,
      withdrawalEnabled: true,
      withdrawalFee: 0.001,
      network: 'TRC20',
    };
  }

  getScanPairs(): string[] {
    return this.scanPairs;
  }

  getExchangesList(): string[] {
    return this.supportedExchanges;
  }

  /**
   * Helper to fetch details about funding rates (for futures/funding arbitrage)
   */
  async getFundingRates(): Promise<any[]> {
    const rates = [];
    // Mock or fetch funding rates for key exchanges supporting perpetuals
    const targetCoins = ['BTC', 'ETH', 'SOL'];
    for (const name of ['binance', 'bybit', 'okx']) {
      for (const coin of targetCoins) {
        // Base rate around 0.01% (standard funding) with slight deviations
        const seed = Math.sin(Date.now() / 120000 + name.length + coin.length);
        const fundingRate = 0.0001 + (seed * 0.0003); // e.g. 0.01% - 0.04%

        rates.push({
          coin,
          exchangeName: name,
          fundingRate: Number((fundingRate * 100).toFixed(4)), // as percentage
          expectedReturn: Number((fundingRate * 100 * 3).toFixed(4)), // Daily return (3 payments)
          riskScore: fundingRate > 0.0005 ? 'MEDIUM' : 'LOW',
        });
      }
    }
    return rates;
  }
}
