import type { DB } from './db.ts';
import { classifyContent } from './content-type.ts';
import { isSocialUrl } from './social.ts';
import { dedupeKey, resultId } from './dedupe.ts';
import { PLATFORMS, type NormalizedItem } from './types.ts';

export interface IngestCounts {
  fetched: number; // items handed in, including malformed/in-batch repeats
  newCount: number;
  updatedCount: number; // already stored, gained a keyword or monitor association
  duplicateCount: number; // already stored, nothing new
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null;

/** Provider output is untrusted: coerce to a well-formed item, or null if unusable. */
function clean(x: any): NormalizedItem | null {
  if (!x || typeof x !== 'object' || !PLATFORMS.includes(x.platform)) return null;
  const url = str(x.url) ?? '';
  const content = str(x.content) ?? '';
  if (!url && !content) return null;
  const published = typeof x.publishedAt === 'string' ? Date.parse(x.publishedAt) : NaN;
  return {
    platform: x.platform,
    sourceId: str(x.sourceId),
    url,
    author: { name: str(x.author?.name), handle: str(x.author?.handle), profileUrl: str(x.author?.profileUrl) },
    title: str(x.title),
    content,
    publishedAt: Number.isNaN(published) ? null : new Date(published).toISOString(),
    matchedKeywords: unionKeywords([], Array.isArray(x.matchedKeywords) ? x.matchedKeywords : []),
    matchVerified: x.matchVerified !== false,
    contentType: classifyContent({ title: str(x.title), content, url }),
    socialWeb: x.platform === 'web' && isSocialUrl(url),
    metadata: x.metadata && typeof x.metadata === 'object' && !Array.isArray(x.metadata) ? x.metadata : {},
    raw: x.raw,
  };
}

function unionKeywords(a: string[], b: unknown[]): string[] {
  const out = [...a];
  const seen = new Set(a.map((k) => k.toLowerCase()));
  for (const k of b) {
    const s = str(k);
    if (s && !seen.has(s.toLowerCase())) (seen.add(s.toLowerCase()), out.push(s));
  }
  return out;
}

/** Merge a rediscovery into what we already have: existing values win, gaps get filled. */
function merge(old: NormalizedItem, next: NormalizedItem): NormalizedItem {
  const oldVerified = old.matchVerified !== false;
  const nextVerified = next.matchVerified !== false;
  return {
    platform: old.platform,
    sourceId: old.sourceId ?? next.sourceId,
    url: old.url || next.url,
    author: {
      name: old.author.name ?? next.author.name,
      handle: old.author.handle ?? next.author.handle,
      profileUrl: old.author.profileUrl ?? next.author.profileUrl,
    },
    title: old.title ?? next.title,
    content: old.content || next.content,
    publishedAt: old.publishedAt ?? next.publishedAt,
    matchedKeywords: oldVerified === nextVerified
      ? unionKeywords(old.matchedKeywords, next.matchedKeywords)
      : oldVerified ? old.matchedKeywords : next.matchedKeywords,
    matchVerified: oldVerified || nextVerified,
    contentType: old.contentType === 'other' ? next.contentType : old.contentType,
    socialWeb: old.socialWeb || next.socialWeb,
    metadata: { ...old.metadata, ...next.metadata },
    raw: next.raw ?? old.raw,
  };
}

export function ingest(db: DB, monitorId: string, items: NormalizedItem[], now: string): IngestCounts {
  const counts: IngestCounts = { fetched: items.length, newCount: 0, updatedCount: 0, duplicateCount: 0 };
  const batch = new Map<string, NormalizedItem>();
  for (const candidate of items) {
    const item = clean(candidate);
    if (!item) continue;
    const key = dedupeKey(item);
    const prev = batch.get(key);
    batch.set(key, prev ? merge(prev, item) : item);
  }

  const select = db.prepare('SELECT * FROM results WHERE dedupe_key = ?');
  const insert = db.prepare(
    `INSERT INTO results (id, dedupe_key, platform, source_id, url, author, title, content, published_at, discovered_at, last_seen_at, matched_keywords, match_verified, content_type, social_web, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const update = db.prepare(
    `UPDATE results SET source_id = ?, url = ?, author = ?, title = ?, content = ?, published_at = ?, last_seen_at = ?, matched_keywords = ?, match_verified = ?, content_type = ?, social_web = ?, metadata = ?
     WHERE id = ?`,
  );
  // SELECT-from-monitors makes this a no-op if the monitor was deleted mid-run.
  const associate = db.prepare('INSERT OR IGNORE INTO result_monitors (result_id, monitor_id) SELECT ?, id FROM monitors WHERE id = ?');
  const saveRaw = db.prepare(
    `INSERT INTO raw_payloads (result_id, fetched_at, payload) VALUES (?, ?, ?)
     ON CONFLICT (result_id) DO UPDATE SET fetched_at = excluded.fetched_at, payload = excluded.payload`,
  );

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [key, item] of batch) {
      const row: any = select.get(key);
      const id = row?.id ?? resultId(key);
      let gainedKeyword = false;
      if (!row) {
        insert.run(
          id, key, item.platform, item.sourceId, item.url, JSON.stringify(item.author), item.title, item.content,
          item.publishedAt, now, now, JSON.stringify(item.matchedKeywords), Number(item.matchVerified !== false), item.contentType ?? 'other', Number(item.socialWeb), JSON.stringify(item.metadata),
        );
      } else {
        const old: NormalizedItem = {
          platform: row.platform,
          sourceId: row.source_id,
          url: row.url,
          author: JSON.parse(row.author),
          title: row.title,
          content: row.content,
          publishedAt: row.published_at,
          matchedKeywords: JSON.parse(row.matched_keywords),
          matchVerified: !!row.match_verified,
          contentType: row.content_type,
          socialWeb: !!row.social_web,
          metadata: JSON.parse(row.metadata),
          raw: undefined,
        };
        const m = merge(old, item);
        gainedKeyword = m.matchedKeywords.some((keyword) => !old.matchedKeywords.includes(keyword)) || (!old.matchVerified && m.matchVerified === true);
        update.run(
          m.sourceId, m.url, JSON.stringify(m.author), m.title, m.content, m.publishedAt, now,
          JSON.stringify(m.matchedKeywords), Number(m.matchVerified !== false), m.contentType ?? 'other', Number(m.socialWeb), JSON.stringify(m.metadata), id,
        );
      }
      const gainedMonitor = Number(associate.run(id, monitorId).changes) > 0;
      const raw = item.raw === undefined ? undefined : JSON.stringify(item.raw);
      if (raw !== undefined) saveRaw.run(id, now, raw);

      if (!row) counts.newCount++;
      else if (gainedKeyword || gainedMonitor) counts.updatedCount++;
      else counts.duplicateCount++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return counts;
}
