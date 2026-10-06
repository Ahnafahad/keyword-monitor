# BUILD PROMPT — Local Keyword Monitoring Engine

You are building the complete V1 of a local-first keyword monitoring product.

Do not stop at a plan, architecture proposal, scaffold, or partially working prototype. Inspect the repository, make the necessary engineering decisions, implement the product, run it, exercise real integrations with the provided Apify token, test the important flows, fix material failures, and leave the repository in a clean state that another person can clone and run.

A separate `DESIGN.md` and visual reference image define the product's visual direction. Read them before implementing the UI.

---

## 1. Product goal

Build a **single-user, local-only keyword monitoring application**.

A user should be able to:

1. clone the GitHub repository;
2. install dependencies;
3. place their Apify API token in `.env`;
4. run one documented command;
5. open the local app;
6. create one or more monitors;
7. let the local background process periodically search LinkedIn, X, and the public web/blog ecosystem for matching content;
8. browse, search, sort, and filter everything discovered from one interface.

V1 has **no accounts, login system, cloud database, organizations, collaboration model, hosted backend, billing system, or remote notification system**.

The local installation is the user's installation. Their data stays local.

The monitoring process should continue while the local application/server process is running, even if the browser tab is closed. If the computer or local process is off, monitoring can stop; cloud scheduling is not part of V1.

---

## 2. Core mental model

The product should revolve around a **Monitor**.

A Monitor is a reusable monitoring configuration containing roughly:

- name;
- one or more keywords / search concepts;
- selected platforms;
- historical lookback window for the initial search;
- monitoring frequency;
- active / paused state;
- timestamps and run state.

Example:

**AI Automation Talent — Bangladesh**

- Keywords / concepts:
  - AI automation Bangladesh
  - AI engineer Bangladesh
  - AI jobs Bangladesh
  - AI automation engineer Bangladesh
- Platforms:
  - LinkedIn
  - X
  - Web / Blogs
- Initial lookback:
  - e.g. last 7 days
- Frequency:
  - every 1 hour

Users may create multiple monitors, and each monitor can have its own keywords, platforms, lookback, and frequency.

Supported frequencies in V1 should include at least:

- 1 hour
- 3 hours
- custom

Keep custom scheduling understandable and cost-conscious. Do not encourage polling more frequently than is sensible for the selected providers.

Users should be able to:

- create a monitor;
- edit it;
- pause / resume it;
- delete it;
- run it immediately;
- see its last run;
- see its next scheduled run;
- see basic recent run status.

---

## 3. Platforms and provider architecture

V1 supports:

1. LinkedIn public-post discovery
2. X public-post discovery
3. Web / blog / article discovery

Apify is the external data acquisition layer.

### Do not tightly couple the application to one specific Actor

At implementation time, research the currently available Apify Actors suitable for each source.

Evaluate candidates pragmatically using criteria such as:

- whether they are currently maintained and usable;
- whether they can search by keyword/query;
- whether they can return public data without requiring the end user to provide LinkedIn cookies, X credentials, browser sessions, or other account credentials;
- output quality and fields;
- stability;
- cost characteristics;
- ability to constrain result count and/or date range;
- documentation quality.

Choose sensible defaults and document what you selected.

Put provider-specific behavior behind a thin adapter/provider interface so that an Actor can later be replaced without rewriting the core application.

Do not scatter Actor-specific parsing logic throughout the product.

Actor IDs and mappings should live in one obvious configuration/provider layer. Optional environment overrides are fine, but normal users should not need to configure Actor IDs.

Do not bypass platform security controls, CAPTCHAs, authentication restrictions, or provider limitations. Use public-data workflows supported by the selected Apify integrations.

---

## 4. Web / blog discovery

"Web" does not mean recursively crawling the entire internet.

Use a two-stage concept where practical:

**search/discovery → useful page extraction**

Search for relevant public results such as:

- blog posts;
- company articles;
- news-style pages;
- hiring pages;
- public articles;
- other indexable web pages relevant to the keyword intent.

Normalize useful information such as:

- title;
- excerpt or relevant content;
- domain/source;
- author when available;
- publication date when available;
- URL;
- matched monitor/keywords;
- discovery timestamp.

Only fetch/extract additional page content where it materially improves the result. Keep the workflow bounded and cost-conscious.

---

## 5. Query behavior

The user-facing keyword UX should remain simple in V1.

Do not force users to learn a query language.

Internally, keep query construction modular enough that platform-specific search syntax or richer Boolean behavior could be added later.

A monitor may contain several related keywords or phrases. A single discovered item may match more than one of them.

The same result must **not** be duplicated merely because several keywords matched.

Store the union of matched keywords on the canonical result.

---

## 6. Canonical normalized result

Create one canonical result model that works across LinkedIn, X, and Web.

The exact schema is your engineering decision, but it should cover concepts like:

```json
{
  "id": "stable-local-id",
  "platform": "linkedin | x | web",
  "sourceId": "provider/source-native-id-if-available",
  "url": "canonical-original-url",
  "author": {
    "name": "string or null",
    "handle": "string or null",
    "profileUrl": "string or null"
  },
  "title": "string or null",
  "content": "normalized useful text",
  "publishedAt": "ISO timestamp or null",
  "discoveredAt": "ISO timestamp",
  "lastSeenAt": "ISO timestamp",
  "matchedKeywords": ["..."],
  "monitorIds": ["..."],
  "metadata": {},
  "rawRef": "reference to preserved raw provider data when available"
}
```

Improve this schema where necessary.

Preserve enough source metadata that future agents/developers can work with the data without going back to Apify.

---

## 7. Deduplication

Deduplication is a first-class requirement.

A result discovered repeatedly across scheduled runs should remain one canonical result.

A result matching multiple keywords should remain one canonical result.

Prefer strong source identifiers when available.

Use canonicalized URLs where appropriate.

When neither exists, use a carefully designed deterministic fallback fingerprint based on stable source fields rather than an unstable random identifier.

A rediscovery may update:

- `lastSeenAt`;
- matched keywords;
- monitor associations;
- useful metadata;

but should not create a duplicate row.

Test this behavior with a real repeated run.

---

## 8. Storage and agent-readable data

Use **SQLite** as the application's operational local database.

At the same time, machine-readable JSON must be treated as a first-class product requirement because future AI agents may be pointed at the repository and asked to work with the corpus.

Keep the data model obvious and documented.

Provide deterministic structured JSON/JSONL access to:

- normalized results;
- monitor definitions;
- run history/status where useful.

A sensible implementation could include:

- local API routes that return normalized JSON;
- and/or predictable JSON/JSONL files under `data/`.

Choose the simplest robust design.

Preserve raw provider payloads when useful for later debugging/reprocessing, but do not force the UI to depend on raw provider structures.

Do not expose secrets in stored JSON.

Document the data layout in the repository.

---

## 9. Run history and recovery

Every monitoring execution should leave enough structured state to understand what happened.

Track useful run information such as:

- monitor;
- platform/provider;
- query/keyword;
- Actor used;
- start time;
- finish time;
- success/failure/throttled state;
- Apify run ID and/or dataset ID when useful;
- total fetched;
- new results;
- updated results;
- duplicates ignored;
- error summary.

The application should remain stable if one platform run fails.

Existing data must never be destroyed because a new run fails.

Use sensible retry/backoff behavior for temporary failures, but do not hammer Apify or a failing Actor.

---

## 10. Agent continuity / handoff

The project must be easy for another coding agent to continue if the current agent is throttled, loses context, or cannot finish in one session.

Maintain BOTH:

### `AGENT_HANDOFF.md`
Human-readable continuation notes.

Keep it concise and current. Include:

- current architecture;
- major decisions made;
- selected Apify Actors and why;
- completed work;
- remaining work;
- exact commands to run;
- last known working state;
- tests already performed;
- failures/blockers;
- latest relevant Apify run IDs / dataset IDs;
- the next concrete actions another agent should take.

### `.agent/STATE.json`
Machine-readable state.

Include fields for things like:

- current phase;
- completed milestones;
- remaining milestones;
- selected providers;
- last successful test;
- last failed/throttled operation;
- retry-after / next-safe-attempt time when known;
- known issues;
- important file paths.

Never write secrets or the Apify token into either handoff file.

Update these after meaningful milestones and before/after potentially long external integration work.

If throttling prevents completion, stop retrying aggressively, record the exact state and retry context, and leave the repository so another agent can resume from that point rather than repeating finished work.

---

## 11. First-run onboarding

Make first-run setup very small.

A sensible flow is:

**Welcome → Apify connection check → Create first monitor → Start**

The user's `.env` should already contain the token during development, but the application should still be able to clearly report whether the backend has a usable Apify configuration.

Do not ever expose the token to client-side JavaScript.

Do not display the actual token in the UI.

Do not log it.

Do not commit `.env`.

Add `.env` to `.gitignore`.

Ship a safe `.env.example`.

---

## 12. Main product areas

Use the supplied visual reference and `DESIGN.md`.

The exact IA is yours to refine, but V1 should cover at least:

### Dashboard
Show a compact high-value overview, such as:

- active monitors;
- new matches;
- total indexed results;
- last / next run information;
- discoveries over time;
- recent monitor activity;
- recent matches.

### Results
This is the main content-consumption screen.

Support:

- platform filter;
- monitor/keyword filter;
- date range;
- newest / oldest sorting;
- search within stored results.

Result presentation should be unified but preserve source identity.

For LinkedIn-like results, useful fields include:

- source badge;
- author/profile;
- post content;
- publication time when available;
- matched keyword(s);
- original post link.

For X, show equivalent fields.

For Web/blog results, show:

- domain/source;
- title;
- excerpt/content;
- author/date when available;
- matched keyword(s);
- original URL.

Clicking an original link should open the real source.

Do not visually impersonate LinkedIn or X.

### Monitors
Let users:

- create;
- edit;
- pause/resume;
- run now;
- delete;
- see last run / next run;
- see concise status.

### Settings / System
Keep this light.

Useful items may include:

- Apify connection status;
- selected/default providers;
- local data location;
- theme preference;
- small diagnostic information.

Do not turn Settings into an administration console.

---

## 13. Visual direction

Read `DESIGN.md` and inspect the supplied visual reference image directly.

The reference's content is a finance dashboard; do not copy the finance semantics.

Translate its **visual grammar** to this product:

- near-black premium workspace;
- slim left navigation rail;
- thin top utility bar;
- dense but calm dashboard composition;
- subtle warm red/coral accent;
- occasional atmospheric glow, used sparingly;
- thin borders and elevated dark panels;
- compact cards rather than oversized SaaS tiles;
- highly legible typography;
- disciplined spacing;
- polished data table/feed treatment;
- strong hover/focus/active states;
- clear dark mode;
- optional light mode if it can be done cleanly without distracting from V1.

The result should feel like a serious monitoring tool, not a generic template and not a clone of LinkedIn/X.

Use the supplied image as the primary visual reference and `DESIGN.md` as the implementation guide.

---

## 14. Local-first technical constraints

Choose a boring, maintainable stack optimized for:

- TypeScript;
- local-first use;
- a polished React-style UI;
- SQLite;
- a local scheduler/background worker;
- one-command development;
- one-command normal start after setup;
- a single local backend process in normal operation where practical.

Do not introduce:

- Docker as a requirement;
- Redis;
- Kafka;
- external queues;
- cloud databases;
- authentication systems;
- microservices;
- hosted infrastructure;
- Kubernetes;
- needless abstraction layers.

The frontend and monitoring scheduler should be part of one cohesive local application.

The scheduler must continue operating while the app/server process runs, even if the browser tab is closed.

Avoid overlapping runs for the same monitor/platform.

Persist enough scheduling state that restarts do not corrupt monitoring state.

Keep the README setup short and reproducible.

---

## 15. Initial real-world test monitor

A valid Apify token will be available in `.env`.

Use it.

Do not merely mock the integration.

Create and test an initial monitor with the intent:

> Find public posts, discussions, job-related posts, company posts, blogs, articles, or other web material indicating demand in Bangladesh for people who work in AI engineering, AI agents, AI automation, LLM workflows, workflow automation, or closely related roles.

Suggested seed concepts include:

- `AI automation Bangladesh`
- `AI automation engineer Bangladesh`
- `AI engineer Bangladesh`
- `AI jobs Bangladesh`
- `AI automation jobs Bangladesh`
- `AI agent engineer Bangladesh`
- `AI workflow automation Bangladesh`
- `LLM engineer Bangladesh`
- `AI developer Bangladesh`

These are **seed intent**, not a rigid literal query list.

Adapt query phrasing per platform where that improves discovery.

Where useful, incorporate hiring/demand language such as:

- hiring;
- looking for;
- seeking;
- need;
- vacancy;
- role;
- job.

Keep the first integration tests bounded and cost-conscious.

Do not schedule expensive repeated hourly runs while developing.

Instead, perform controlled manual runs sufficient to validate the system.

---

## 16. Real acceptance test

Do not consider the integration complete merely because an HTTP request returns successfully.

Exercise the real path:

```text
.env token
→ validate Apify connectivity
→ create the Bangladesh AI monitor
→ run real LinkedIn discovery
→ run real X discovery
→ run real Web/blog discovery
→ receive provider results
→ normalize them
→ deduplicate them
→ persist them
→ expose agent-readable structured data
→ render them in the UI
→ filter/search/sort them
→ run a controlled repeat search
→ confirm already-seen records do not duplicate
```

Inspect representative returned records from each successful provider and make sure the field mapping is genuinely useful.

If a selected Actor turns out to be unreliable or unsuitable, replace it through the provider layer rather than patching the core application around it.

Do not endlessly spend Apify credits chasing unavailable data. Use small result limits during development.

---

## 17. Error behavior

Handle expected failures cleanly:

- invalid/missing token;
- Actor failure;
- empty results;
- partial provider outage;
- rate limit/throttle;
- malformed source item;
- unavailable publication date;
- scheduler restart;
- provider returning previously seen results.

Failures should be visible enough to diagnose but should not dominate the normal user experience.

A failed run must not delete valid existing results.

---

## 18. Security and privacy

The token is server-side only.

Never:

- send it to the browser;
- write it into rendered HTML;
- write it to JSON exports;
- print it to logs;
- include it in screenshots;
- include it in handoff files;
- commit it.

Keep `.env` ignored.

This is a local single-user application. Do not add user tracking or analytics.

---

## 19. Repository experience

A new user should be able to understand the project quickly.

Provide:

- a clear `README.md`;
- `.env.example`;
- install command;
- start command;
- development command if different;
- explanation of where local data lives;
- how monitors work;
- how to replace/override an Apify provider later;
- basic troubleshooting;
- note about Apify usage/cost and polling frequency.

Do not make the README enormous.

---

## 20. Testing

Test the important logic, especially:

- normalization;
- deduplication;
- multi-keyword matching;
- monitor CRUD;
- scheduler behavior;
- provider mapping;
- numeric/date parsing where relevant;
- API/result filtering;
- repeated-ingestion behavior.

Use mocked provider fixtures for repeatable automated tests, AND perform bounded real Apify integration checks using the provided `.env`.

Do not make the full test suite depend on paid live calls.

---

## 21. Development behavior and autonomy

These requirements define the product goal and quality bar, not every implementation detail.

Use your engineering judgment.

Before changing an existing repository, inspect it first and preserve useful existing work.

If the repository is fresh, scaffold the simplest architecture that satisfies the requirements.

Do not ask the user to make minor technical decisions you can make responsibly yourself.

Do not over-engineer.

Do not add unrelated features such as AI summaries, sentiment analysis, email notifications, Telegram bots, collaboration, cloud sync, or billing unless they are already present and required by the repository.

Do not stop after generating code. Run it.

Do not stop after it runs. Test the important real workflow.

Do not stop after finding an error. Fix it.

Keep `AGENT_HANDOFF.md` and `.agent/STATE.json` current throughout meaningful milestones so the project is resumable.

---

## 22. Definition of done

V1 is done when:

- the local app installs and starts from documented commands;
- `.env` loading is safe;
- first-run connection state is understandable;
- monitors can be created and managed;
- local scheduling works while the process is running;
- LinkedIn, X, and Web/blog providers exist behind replaceable adapters;
- at least the viable selected providers have been exercised against real Apify data;
- results normalize into one canonical model;
- duplicates do not accumulate across repeat searches;
- multi-keyword matches merge correctly;
- data persists in SQLite;
- agent-readable structured JSON/JSONL access exists and is documented;
- the dashboard, results, monitors, and basic settings/system UI work;
- search/filter/sort work;
- the UI reflects the supplied visual reference and `DESIGN.md`;
- the application behaves reasonably on common desktop sizes and smaller widths;
- relevant automated tests pass;
- bounded live integration tests have been run;
- secrets are not exposed;
- handoff/recovery state is current;
- the README is usable;
- there are no known material blockers being silently ignored.

If a genuine external blocker such as rate limiting prevents one final live verification, do not fake success. Record the exact blocker, external run IDs/state, what has already passed, and the next safe action in the handoff files so another agent can continue without repeating completed work.

At completion, give the user a concise summary of:

- what was built;
- selected Apify providers;
- what was tested live;
- test results;
- important remaining limitations, if any;
- exact command to start the application.
