# Providers

Each source is one adapter in `server/providers/` exporting a `Provider` (`server/providers/types.ts`). All
actor-specific input building and output parsing lives in that one file; the rest of the app only sees
`NormalizedItem`. Chosen 2026-10-07 after probing the Apify Store; all three are pay-per-use (no monthly
rental) and need nothing but `APIFY_API_TOKEN` — no cookies, logins or sessions.

| Source | Default actor | Published Starter rate (7 Oct 2026) | Runs per monitor run | Estimate at 20 items/keyword |
|---|---|---|---|---|
| LinkedIn | `harvestapi/linkedin-post-search` | $0.002 per post + $0.00005 per run | 1 (all keywords batched) | ~$0.04 per keyword |
| X | `xquik/x-tweet-scraper` | $0.00015 per tweet, no start fee | 1 per keyword, in parallel | ~$0.003 per keyword |
| Web | `apify/google-search-scraper` | $0.0025 per results page + $0.001 per run | 1 (all keywords batched) | ~$0.005 per keyword + $0.001 |

A 9-keyword monitor at 20 items per keyword is roughly $0.36 (LinkedIn) + $0.03 (X) + $0.05 (Web) per
run, and usually less because LinkedIn and X charge per returned item. Web charges per scraped results page even when its results are filtered out locally. LinkedIn may also charge $0.001 for each query returning no posts; X platform usage is separate. **LinkedIn dominates the cost** — an hourly
9-keyword LinkedIn monitor could reach ~$8/day, so keep LinkedIn monitors on a slow schedule or a small
keyword list. Measured: LinkedIn 9 posts = $0.018; X 6 tweets = $0.0011; Web 2 pages (17 results) = $0.006.

The monitor form estimates the weekly amount using the selected Apify plan, sources, keyword count, run interval, and configured `MAX_ITEMS_PER_KEYWORD`. It assumes the requested item limit is reached on every run and includes published start and empty-query charges as a conservative allowance. It does not include Apify plan subscription costs or X platform usage, and it is **not a spending cap**. Check the live [LinkedIn](https://apify.com/harvestapi/linkedin-post-search/pricing), [X](https://apify.com/xquik/x-tweet-scraper/pricing), and [Web](https://apify.com/apify/google-search-scraper/pricing) rate cards before a large schedule. Overridden Actor IDs have different prices, so the form suppresses its estimate for them.

## LinkedIn — `harvestapi/linkedin-post-search`

- Why: most used no-cookie post search (7.7k users/30d, 99.7% run success, rating 5.0, updated 2026-09),
  accepts many queries in one run, and each item carries `query.search`, so results are attributed to their
  keyword without extra runs. Rich output: activity id, share URN, author, exact timestamp, engagement.
- Input: `searchQueries` = keywords as typed, `maxPosts` = items per keyword, `postedLimitDate` = `since`
  (ISO), `sortBy: relevance`, reactions/comments scraping off.
- Mapping: `sourceId` = activity id (`id`), `url` = `linkedinUrl`, author name / `publicIdentifier` (or
  company `universalName`) / profile URL, `publishedAt` = `postedAt.date`, metadata = likes, comments, shares,
  author headline, author type, share URN, linked article.
- Limits: LinkedIn search is fuzzy — expect loosely related posts. `sortBy: date` was tried and is much
  noisier. The date filter is bucketed by LinkedIn (24h / week / month); the adapter re-filters by exact time.
- Fallback: `apimaestro/linkedin-posts-search-scraper-no-cookies` ($0.005/post, one keyword per run,
  `date_filter` buckets only).

## X — `xquik/x-tweet-scraper`

- Why: no login, cheapest per tweet, no start fee and no minimum item count, so tiny bounded runs work
  (verified at 1–10 tweets). 1.3M runs/30d with ~0% failures, rating 4.7.
  Not chosen: `apidojo/tweet-scraper` (not probed; $0.0004/tweet and reputed to restrict very small runs)
  and `api-ninja/x-twitter-advanced-search` ($0.01 start fee, $0.10 minimum charge, 20-tweet minimum).
- Input: `searchTerms: ["<keyword> since:YYYY-MM-DD"]`, `maxItems`, `queryType: Latest`. Native retweets
  are excluded by the actor by default.
- One run per keyword: the output has no field saying which search term matched (also checked with
  `outputVariant: rich`), so batching would lose keyword attribution. Cost is identical because only tweets
  are billed.
- Mapping: `sourceId` = tweet id, `url`, author name / `username` / `https://x.com/<username>`,
  `content` = full text (long-form `noteTweet.text` when present, t.co links expanded, X Articles get title +
  preview), `publishedAt` from `createdAt`, metadata = likes, reposts, replies, quotes, views, bookmarks,
  language, hashtags, author followers/bio, link card.
- Limits: X AND-matches every word, so long keywords ("AI automation jobs Bangladesh") return few posts in a
  short window (1 in 7 days in the live check). `since:` is day-precise; the adapter re-filters by exact time.
- Fallback: `kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest` ($0.00025/tweet, but a
  20-tweet minimum per term and `maxItems` is not a strict cap).

## Web — `apify/google-search-scraper`

- Why: Apify-maintained, 21k users/30d, one run takes all queries (one per line) and each results page
  reports its `searchQuery.term`. Organic results give title, snippet, URL, site name, rank and usually a date.
- Design: **search only, no page-extraction stage.** The snippet is enough to triage a monitoring feed and
  extraction would multiply cost and latency (~$0.002–0.005 extra per page). To add it later, enable the
  actor's `websiteContentScraper` input in `buildWebInput` and read `websiteContent.text` in `mapWebItem`, or
  switch to the fallback. `APIFY_ACTOR_WEB_EXTRACT` is therefore not used.
- Input: `queries` = `"<keyword> after:YYYY-MM-DD"` lines, `maxPagesPerQuery = ceil(items / 10)`, HTML
  snapshots off. `runActor` is called **without** `maxItems`: Apify converts it to a max-charge cap and this
  actor rejects caps under $0.50. The run is bounded by keywords × pages instead.
- Mapping: one item per organic result; `sourceId` = null (dedupe by URL), `title`, `content` = snippet
  (≤ 2000 chars), `author` = null (Google gives no byline), `publishedAt` = Google's date or null, metadata =
  domain, site name, search rank, emphasized keywords.
- Limits: dates are Google's and often derived from "3 days ago", so day-level at best; some results have no
  date (kept, with `publishedAt: null`). Results include job boards and social pages (linkedin.com,
  facebook.com). No country/language bias is set.
- Fallback: `apify/rag-web-browser` (search + page text as Markdown in one actor; ~$0.003 per search +
  ~$0.002 per page, one query per run).

## Overriding or swapping

- Different actor with the **same input/output shape**: set `APIFY_ACTOR_LINKEDIN`, `APIFY_ACTOR_X` or
  `APIFY_ACTOR_WEB_SEARCH` in `.env` (e.g. `APIFY_ACTOR_X=someone/some-actor`).
- Different shape: edit only that adapter — `build*Input` (what is sent) and `map*Item` (what comes back) —
  and refresh the sample in `server/providers/__fixtures__/`. Query phrasing lives in the pure `build*Query`
  functions; shared date/keyword helpers are in `server/providers/query.ts`.
- Tests (offline, against synthetic samples shaped like provider output): `node --import tsx --test server/providers/providers.test.ts`

## Live checks (2026-10-07)

Through each adapter's `search()` with keywords `AI engineer Bangladesh`, `AI automation jobs Bangladesh`,
5 items per keyword, since 7 days ago:

| Source | Run ID(s) | Dataset ID(s) | Normalized items |
|---|---|---|---|
| LinkedIn | `IjDjozdo72CSXohIK` | `kofQzrp4XtysuTDad` | 10 |
| X | `4bTfOptUf1OKcrLQm`, `nkAOix8cmQmxJivel` | `npn4xafZUCjCdHTOP`, `YWnXIk2sMrfBlobwC` | 6 (5 + 1) |
| Web | `lxRG4B9CiHW8RS5bR` | `qbZNgkgSK8owUCzLo` | 9 (1 dropped as older than `since`) |

The committed provider fixtures are synthetic and contain no captured posts or profile contact details.
