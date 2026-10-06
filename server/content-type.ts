import type { ContentType, NormalizedItem } from './types.ts';

/** Broad, explainable labels for choosing a feed. Unclear items stay in Other. */
export function classifyContent(item: Pick<NormalizedItem, 'title' | 'content' | 'url'>): ContentType {
  const text = `${item.title ?? ''} ${item.content}`.normalize('NFKC').toLowerCase();
  const url = item.url.toLowerCase();
  if (/\b(we(?:'|’)re hiring|we are hiring|hiring now|now hiring|job opening|job opportunity|job vacancy|vacanc(?:y|ies)|apply now|apply for this|open positions?|recruiting|recruitment|full[ -]time|part[ -]time|salary|compensation)\b/.test(text)
    || /\/(jobs?|careers?|vacancies|positions?)\//.test(url)) return 'jobs';
  if (/\b(course|training|bootcamp|workshop|webinar|seminar|certification|enroll(?:ment)?|curriculum|degree program)\b/.test(text)
    || /\/(courses?|training|workshops?|webinars?)\//.test(url)) return 'courses';
  if (/\/in\/[^/?#]+/.test(url) && /linkedin\.com/.test(url)
    || /\b(portfolio|hire me|freelancer|i am an? (?:ai|software|automation)|i'm an? (?:ai|software|automation))\b/.test(text)) return 'people';
  if (/\b(news|report(?:s|ed)?|study|research|announc(?:e|es|ed)|launch(?:es|ed)?|funding|raises|policy|press release)\b/.test(text)
    || /\/(news|articles?|blog|press)\//.test(url)) return 'news';
  return 'other';
}
