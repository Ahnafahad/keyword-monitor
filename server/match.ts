import type { MatchMode, NormalizedItem } from './types.ts';

const NEARBY_WORDS = 20;
const VARIANTS: Record<string, string[]> = {
  ai: ['artificial intelligence'],
  llm: ['llms', 'large language model', 'large language models'],
  bangladesh: ['bangladeshi', 'dhaka'],
  automation: ['automate', 'automated', 'automating'],
  engineer: ['engineers', 'engineering'],
  developer: ['developers'],
  jobs: ['job'],
  agent: ['agents', 'agentic'],
  workflow: ['workflows'],
};

const words = (text: string): string[] => text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

type Range = { start: number; end: number };

function occurrences(text: string[], term: string): Range[] {
  const options = [term, ...(VARIANTS[term] ?? [])].map(words);
  const found: Range[] = [];
  for (const option of options) {
    for (let start = 0; start <= text.length - option.length; start++) {
      if (option.every((word, offset) => text[start + offset] === word)) {
        found.push({ start, end: start + option.length - 1 });
      }
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/** Every keyword concept must be visible; nearby means one 20-word window contains them all. */
export function keywordMatches(keyword: string, title: string | null, content: string, mode: MatchMode): boolean {
  const text = words(`${title ?? ''} ${content}`);
  const terms = [...new Set(words(keyword))];
  if (!terms.length) return false;
  const hits = terms.map((term) => occurrences(text, term));
  if (hits.some((ranges) => !ranges.length)) return false;
  if (mode === 'anywhere') return true;
  for (const start of hits.flatMap((ranges) => ranges.map((range) => range.start))) {
    const chosen = hits.map((ranges) => ranges.find((range) => range.start >= start));
    if (chosen.every((range) => range !== undefined) && Math.max(...chosen.map((range) => range!.end)) - start + 1 <= NEARBY_WORDS) {
      return true;
    }
  }
  return false;
}

export function verifiedKeywords(item: Pick<NormalizedItem, 'title' | 'content' | 'matchedKeywords'>, mode: MatchMode): string[] {
  return item.matchedKeywords.filter((keyword) => keywordMatches(keyword, item.title, item.content, mode));
}

/** Web snippets may omit the page text that made a search hit; keep those with a warning. */
export function acceptMatch(item: NormalizedItem, mode: MatchMode): NormalizedItem | null {
  const verified = verifiedKeywords(item, mode);
  if (verified.length) return { ...item, matchedKeywords: verified, matchVerified: true };
  return item.platform === 'web' ? { ...item, matchVerified: false } : null;
}
