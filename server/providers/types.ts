import type { NormalizedItem, Platform } from '../types.ts';

export interface ProviderQuery {
  keywords: string[];
  /** Only items published at/after this are wanted (initial lookback, or last run time). */
  since: Date;
  /** Cost bound: max items to request per keyword query. */
  maxItemsPerKeyword: number;
  /** Keep social-site pages out of web searches; ignored by other providers. */
  excludeSocialWeb?: boolean;
}

export interface ProviderResult {
  /** Queries actually sent to the actor (after platform-specific phrasing). */
  queries: string[];
  apifyRunIds: string[];
  datasetIds: string[];
  /** Normalized items. The same post may appear once per keyword; core merges them. */
  items: NormalizedItem[];
}

/** One adapter per platform. All actor-specific input building and output parsing lives in the adapter. */
export interface Provider {
  platform: Platform;
  label: string;
  actorId: string;
  search(query: ProviderQuery): Promise<ProviderResult>;
}
