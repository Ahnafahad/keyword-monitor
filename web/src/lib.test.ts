// Run: node --import tsx --test web/src/lib.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { addKeywords, dayBoundary, freqLabel, relTime, safeUrl, splitKeywords } from './lib.ts';

test('lib helpers', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');
  assert.equal(relTime('2026-10-07T11:48:00Z', now), '12m ago');
  assert.equal(relTime('2026-10-07T15:00:00Z', now), 'in 3h');
  assert.equal(relTime('2026-10-05T12:00:00Z', now), '2d ago');
  assert.equal(relTime(null, now), '—');
  assert.equal(relTime('garbage', now), '—');

  assert.deepEqual(splitKeywords(' AI  automation,\nAI engineer Bangladesh\n\n, '), ['AI automation', 'AI engineer Bangladesh']);
  assert.deepEqual(addKeywords(['AI jobs'], ['ai JOBS', 'LLM', 'llm']), ['AI jobs', 'LLM']);

  assert.equal(freqLabel(60), 'Every hour');
  assert.equal(freqLabel(180), 'Every 3 hours');
  assert.equal(freqLabel(45), 'Every 45 min');

  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('not a url'), null);
  assert.equal(safeUrl('https://example.com/a'), 'https://example.com/a');

  assert.equal(dayBoundary('nope', false), undefined);
  assert.ok(Date.parse(dayBoundary('2026-10-07', true)!) > Date.parse(dayBoundary('2026-10-07', false)!));
});
