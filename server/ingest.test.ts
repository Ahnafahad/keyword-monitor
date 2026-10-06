import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getRaw, listResults } from './db.ts';
import { ingest } from './ingest.ts';
import { item, testCtx } from './test-helpers.ts';

const T1 = '2026-10-07T12:00:00.000Z';
const T2 = '2026-10-07T13:00:00.000Z';

test('repeated ingestion creates no duplicates and reports duplicateCount', () => {
  const { db, addMonitor } = testCtx();
  const m = addMonitor();
  const batch = [item({ sourceId: '1' }), item({ sourceId: '2', url: 'https://x.com/a/status/2' })];

  assert.deepEqual(ingest(db, m.id, batch, T1), { fetched: 2, newCount: 2, updatedCount: 0, duplicateCount: 0 });
  assert.deepEqual(ingest(db, m.id, batch, T2), { fetched: 2, newCount: 0, updatedCount: 0, duplicateCount: 2 });

  const { items, total } = listResults(db, {});
  assert.equal(total, 2);
  assert.equal(items[0].discoveredAt, T1, 'discoveredAt is never overwritten');
  assert.equal(items[0].lastSeenAt, T2);
  assert.deepEqual(items[0].monitorIds, [m.id]);
  assert.equal(items[0].rawRef, `/api/results/${items[0].id}/raw`);
  assert.deepEqual(getRaw(db, items[0].id)?.payload, { original: true });
});

test('multi-keyword matches merge into one row with the union of keywords', () => {
  const { db, addMonitor } = testCtx();
  const m = addMonitor();
  const counts = ingest(
    db,
    m.id,
    [item({ matchedKeywords: ['ai engineer'] }), item({ matchedKeywords: ['AI Engineer', 'ai jobs'] })],
    T1,
  );
  assert.deepEqual(counts, { fetched: 2, newCount: 1, updatedCount: 0, duplicateCount: 0 });
  assert.deepEqual(listResults(db, {}).items[0].matchedKeywords, ['ai engineer', 'ai jobs']);

  // A later run surfacing it under another keyword updates the same row.
  assert.deepEqual(ingest(db, m.id, [item({ matchedKeywords: ['llm engineer'] })], T2), {
    fetched: 1, newCount: 0, updatedCount: 1, duplicateCount: 0,
  });
  const { items, total } = listResults(db, {});
  assert.equal(total, 1);
  assert.deepEqual(items[0].matchedKeywords, ['ai engineer', 'ai jobs', 'llm engineer']);
});

test('a second monitor adds an association instead of a row', () => {
  const { db, addMonitor } = testCtx();
  const a = addMonitor({ name: 'A' });
  const b = addMonitor({ name: 'B' });
  ingest(db, a.id, [item()], T1);
  assert.deepEqual(ingest(db, b.id, [item()], T2), { fetched: 1, newCount: 0, updatedCount: 1, duplicateCount: 0 });
  const { items, total } = listResults(db, {});
  assert.equal(total, 1);
  assert.deepEqual(items[0].monitorIds, [a.id, b.id].sort());
});

test('malformed items are skipped without failing the batch', () => {
  const { db, addMonitor } = testCtx();
  const m = addMonitor();
  const junk = [null, 'nope', { platform: 'x' }, item({ url: '', content: '  ' }), { ...item(), platform: 'myspace' }] as any[];
  const counts = ingest(db, m.id, [...junk, item({ sourceId: 'good' })], T1);
  assert.deepEqual(counts, { fetched: 6, newCount: 1, updatedCount: 0, duplicateCount: 0 });
  assert.equal(listResults(db, {}).total, 1);
});

test('null or unparseable publishedAt is accepted; later sightings fill gaps', () => {
  const { db, addMonitor } = testCtx();
  const m = addMonitor();
  const bare = item({
    platform: 'web', sourceId: null, url: 'https://example.com/post?utm_source=a',
    publishedAt: null, title: null, author: { name: null, handle: null, profileUrl: null }, metadata: { domain: 'example.com' },
  });
  ingest(db, m.id, [bare, item({ sourceId: 'bad-date', publishedAt: 'yesterday-ish' })], T1);
  let rows = listResults(db, { platform: 'web' }).items;
  assert.equal(rows[0].publishedAt, null);
  assert.equal(listResults(db, { platform: 'x' }).items[0].publishedAt, null);

  ingest(
    db,
    m.id,
    [{ ...bare, url: 'https://www.example.com/post/', publishedAt: '2026-10-01T10:00:00+06:00', title: 'A post',
       author: { name: 'Alice', handle: null, profileUrl: null }, metadata: { words: 900 } }],
    T2,
  );
  rows = listResults(db, { platform: 'web' }).items;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].publishedAt, '2026-10-01T04:00:00.000Z', 'normalized to UTC ISO');
  assert.equal(rows[0].title, 'A post');
  assert.equal(rows[0].author.name, 'Alice');
  assert.deepEqual(rows[0].metadata, { domain: 'example.com', words: 900 });
  assert.equal(rows[0].discoveredAt, T1);
});

test('a failing batch rolls back completely', () => {
  const { db, addMonitor } = testCtx();
  const m = addMonitor();
  ingest(db, m.id, [item({ sourceId: 'keep' })], T1);
  const circular: any = {};
  circular.self = circular;
  assert.throws(() => ingest(db, m.id, [item({ sourceId: 'a' }), item({ sourceId: 'b', raw: circular })], T2));
  assert.equal(listResults(db, {}).total, 1);
});
