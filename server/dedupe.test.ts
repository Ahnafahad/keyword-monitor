import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalizeUrl, dedupeKey, resultId } from './dedupe.ts';
import { item } from './test-helpers.ts';

test('canonicalizeUrl: host case, www, fragment, trailing slash, scheme', () => {
  assert.equal(canonicalizeUrl('HTTP://WWW.Example.com/Blog/Post/#top'), 'https://example.com/Blog/Post');
  assert.equal(canonicalizeUrl('https://example.com/'), 'https://example.com');
  assert.equal(canonicalizeUrl('  https://example.com/a  '), 'https://example.com/a');
});

test('canonicalizeUrl: drops tracking params, keeps and sorts the rest', () => {
  assert.equal(
    canonicalizeUrl('https://example.com/post?utm_source=tw&UTM_Medium=x&fbclid=1&gclid=2&ref=hn&trk=a&page=2&a=1'),
    'https://example.com/post?a=1&page=2',
  );
  assert.equal(canonicalizeUrl('https://example.com/post?b=2&a=1'), canonicalizeUrl('https://example.com/post/?a=1&b=2#x'));
  assert.equal(canonicalizeUrl('https://example.com/post?utm_campaign=x'), 'https://example.com/post');
});

test('canonicalizeUrl: X host variants reduce to the status id', () => {
  const expected = 'https://x.com/i/status/1234567890';
  for (const url of [
    'https://twitter.com/Alice/status/1234567890',
    'https://x.com/alice/status/1234567890?s=20&t=abc',
    'https://mobile.twitter.com/alice/status/1234567890/photo/1',
    'http://www.twitter.com/i/web/status/1234567890',
    'https://mobile.x.com/alice/statuses/1234567890',
  ]) {
    assert.equal(canonicalizeUrl(url), expected, url);
  }
  assert.equal(canonicalizeUrl('https://twitter.com/alice'), 'https://x.com/alice');
});

test('canonicalizeUrl: LinkedIn drops query and country subdomain', () => {
  assert.equal(
    canonicalizeUrl('https://bd.linkedin.com/posts/alice_hiring-activity-71234/?utm_source=share&rcm=abc'),
    'https://linkedin.com/posts/alice_hiring-activity-71234',
  );
});

test('canonicalizeUrl: unparseable input does not throw', () => {
  assert.equal(canonicalizeUrl(' Not A Url '), 'not a url');
});

test('dedupeKey: source id, then canonical url, then fingerprint', () => {
  assert.equal(dedupeKey(item({ sourceId: ' 42 ' })), 'x:id:42');
  assert.equal(
    dedupeKey(item({ sourceId: null, url: 'https://twitter.com/a/status/42?s=20' })),
    'x:url:https://x.com/i/status/42',
  );
  assert.equal(
    dedupeKey(item({ platform: 'web', sourceId: null, url: 'https://www.example.com/a/?utm_source=x' })),
    dedupeKey(item({ platform: 'web', sourceId: null, url: 'http://example.com/a' })),
  );
  // The same id on different platforms is not the same result.
  assert.notEqual(dedupeKey(item({ platform: 'x' })), dedupeKey(item({ platform: 'linkedin' })));
});

test('dedupeKey: fingerprint fallback is deterministic and whitespace/case insensitive', () => {
  const base = { sourceId: null, url: '' };
  const a = dedupeKey(item({ ...base, content: 'Hiring  an AI\nEngineer' }));
  const b = dedupeKey(item({ ...base, content: ' hiring an ai engineer ' }));
  assert.match(a, /^x:fp:[0-9a-f]{64}$/);
  assert.equal(a, b);
  assert.notEqual(a, dedupeKey(item({ ...base, content: 'Something else' })));
  assert.notEqual(a, dedupeKey(item({ ...base, content: 'Hiring an AI engineer', publishedAt: null })));
  assert.notEqual(a, dedupeKey(item({ ...base, content: 'Hiring an AI engineer', author: { name: null, handle: 'other', profileUrl: null } })));
  // Only the first 200 normalized characters count.
  const long = 'x'.repeat(200);
  assert.equal(dedupeKey(item({ ...base, content: long + 'A' })), dedupeKey(item({ ...base, content: long + 'B' })));
});

test('resultId: stable 16 hex chars derived from the key', () => {
  assert.match(resultId('x:id:42'), /^[0-9a-f]{16}$/);
  assert.equal(resultId('x:id:42'), resultId('x:id:42'));
  assert.notEqual(resultId('x:id:42'), resultId('x:id:43'));
});
