# Product

## Register

product

## Users

One person running the app on their own machine: a founder, recruiter, analyst or marketer who wants to know when a topic is being talked about on LinkedIn, X and the public web. They set up a monitor once, leave the process running, and come back a few times a day to scan what is new. They are at a desk, on a laptop or desktop monitor, usually with other work open beside it. They are not a developer by necessity, but they did clone a repo and paste an API token.

## Product Purpose

A local-first keyword monitoring engine. The user defines monitors (keywords, sources, lookback, frequency); a background scheduler searches LinkedIn, X and the web through Apify, normalizes and de-duplicates what it finds, and stores it in a local SQLite database with agent-readable JSON exports. Success is a corpus the user trusts: nothing duplicated, nothing silently lost, every item traceable to its original source, and the state of the monitoring always visible at a glance.

There are no accounts, no cloud, no collaboration. The data is the user's and stays on their machine.

## Brand Personality

Quiet, precise, operational. It should feel like a high-end local intelligence console that is calmly watching several sources in the background. The voice is plain and factual: it states what ran, what it found and what failed, in the user's terms rather than the provider's. It never celebrates, never apologises at length, never invents numbers.

Reference for feel: the supplied dark dashboard image (`design-reference.png`), for its density, premium darkness and precise card rhythm. Only the element grammar is borrowed, not the finance content or its red palette; colour and type follow the ui-ux-pro-max system recorded in DESIGN.md §28.

## Anti-references

- A generic colourful SaaS dashboard with oversized gradient tiles and decorative whitespace.
- A clone of LinkedIn's or X's own interface, or loud use of their brand colours.
- Neon cyberpunk, glassmorphism everywhere, glow on every card.
- A marketing landing page: hero sections, illustrations, testimonials.
- An administration console: settings sprawl, provider internals and Actor IDs in the normal flow.
- An AI assistant chat panel, fake metrics, fake progress percentages.

## Design Principles

1. **State is always visible.** Whether monitoring is running, when it last ran, when it runs next and whether anything failed should be answerable from any screen without digging.
2. **The content is the product.** Results are read, scanned and opened at the source. Chrome stays quiet so matches can be dense and legible.
3. **Never fake it.** Every number, status and timestamp on screen comes from stored data. Unknown is shown as unknown.
4. **Calm failure.** One source failing is normal. Say what failed, confirm existing results are safe, offer the next action, and move on.
5. **Small first run.** From clone to first monitor in a couple of minutes, with no query language and no provider configuration.

## Accessibility & Inclusion

WCAG 2.1 AA. Full keyboard operation with visible focus, labelled icon-only controls, no colour-only status, 4.5:1 text contrast in both themes, `prefers-reduced-motion` respected, usable from 375px to large desktop.
