export const SOCIAL_DOMAINS = [
  'facebook.com', 'instagram.com', 'reddit.com', 'linkedin.com', 'x.com', 'twitter.com',
  'threads.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'pinterest.com',
];

export function isSocialUrl(input: string): boolean {
  try {
    const host = new URL(input).hostname.toLowerCase();
    return SOCIAL_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}
