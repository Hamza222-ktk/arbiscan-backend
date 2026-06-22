import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsEvent } from '../database/entities';

export interface AdConfig {
  nativeSpacing: number; // e.g. native ad every X cards
  interstitialCooldownSeconds: number; // minimum time between full-screen ads
  rewardBoostActive: boolean;
  appOpenAdActive: boolean;
  bannerAdActive: boolean;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private activeBoosts = new Map<string, number>(); // deviceUuid -> expiry timestamp

  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly analyticsRepository: Repository<AnalyticsEvent>,
  ) {}

  /**
   * Log an analytics tracking event (e.g. ad CTR, screen visit, heatmap)
   */
  async logEvent(eventType: string, deviceUuid: string, metadata: any) {
    try {
      const event = new AnalyticsEvent();
      event.eventType = eventType;
      event.deviceUuid = deviceUuid;
      event.metadata = metadata;

      await this.analyticsRepository.save(event);
      this.logger.log(`[ANALYTICS] Saved event '${eventType}' from device ${deviceUuid || 'unknown'}`);
    } catch (err) {
      this.logger.error(`Failed to log analytics event: ${err.message}`);
    }
  }

  /**
   * Retrieve dynamic Ad frequencies and check if user has active booster overrides
   */
  getAdConfig(deviceUuid?: string): AdConfig {
    const defaultSettings = {
      nativeSpacing: 5,
      interstitialCooldownSeconds: 180, // 3 minutes
      rewardBoostActive: false,
      appOpenAdActive: true,
      bannerAdActive: true,
    };

    if (deviceUuid && this.isBoostActive(deviceUuid)) {
      // User watched rewarded ad, modify settings dynamically (e.g. reduce ad presence or boost details)
      return {
        ...defaultSettings,
        nativeSpacing: 8, // less frequent ads
        rewardBoostActive: true,
      };
    }

    return defaultSettings;
  }

  /**
   * Register a temporary 30-minute boost unlocked by watching a rewarded ad
   */
  async registerBoost(deviceUuid: string) {
    const expiry = Date.now() + 30 * 60 * 1000; // 30 minutes TTL
    this.activeBoosts.set(deviceUuid, expiry);
    this.logger.log(`[BOOST UNLOCKED] Reward boost registered for device ${deviceUuid}. Expiry in 30 minutes.`);

    // Log the click analytics
    await this.logEvent('REWARD_AD_COMPLETE', deviceUuid, { boostType: '30_MIN_REFRESH' });
  }

  isBoostActive(deviceUuid: string): boolean {
    if (!deviceUuid) return false;
    const expiry = this.activeBoosts.get(deviceUuid);
    if (!expiry) return false;

    if (Date.now() > expiry) {
      this.activeBoosts.delete(deviceUuid); // clean up expired boost
      return false;
    }
    return true;
  }
}
