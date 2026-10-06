import type { Platform } from './api.ts';

export type ApifyPlan = 'free' | 'starter' | 'scale' | 'business';

// Published Apify Actor event prices, checked 2026-10-07. USD per event.
export const ACTOR_RATES: Record<ApifyPlan, { linkedinPost: number; webPage: number }> = {
  free: { linkedinPost: 0.002, webPage: 0.0045 },
  starter: { linkedinPost: 0.002, webPage: 0.0025 },
  scale: { linkedinPost: 0.00175, webPage: 0.00195 },
  business: { linkedinPost: 0.0015, webPage: 0.0018 },
};

export const DEFAULT_ACTORS: Record<Platform, string> = {
  linkedin: 'harvestapi/linkedin-post-search',
  x: 'xquik/x-tweet-scraper',
  web: 'apify/google-search-scraper',
};

export function estimateWeeklyCost(
  keywordCount: number,
  platforms: Platform[],
  frequencyMinutes: number,
  maxItemsPerKeyword: number,
  plan: ApifyPlan,
) {
  const runs = 10080 / frequencyMinutes;
  const rates = ACTOR_RATES[plan];
  const linkedin = platforms.includes('linkedin')
    ? keywordCount * maxItemsPerKeyword * rates.linkedinPost + keywordCount * 0.001 + 0.00005
    : 0;
  const x = platforms.includes('x') ? keywordCount * maxItemsPerKeyword * 0.00015 : 0;
  const web = platforms.includes('web')
    ? keywordCount * Math.max(1, Math.ceil(maxItemsPerKeyword / 10)) * rates.webPage + 0.001
    : 0;
  return { runs, perRun: linkedin + x + web, weekly: (linkedin + x + web) * runs };
}
