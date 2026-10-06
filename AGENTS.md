# Agent guide

This is a local keyword monitoring app. Read [README.md](README.md), [docs/SETUP.md](docs/SETUP.md), and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing the run pipeline. `server/types.ts` is the shared API contract; [PROVIDERS.md](PROVIDERS.md) explains the Apify Actors and their limitations.

## Working in this repository

- State assumptions when requirements are ambiguous. Prefer the smallest change that meets the request and keep unrelated code and formatting untouched.
- Trace a monitor setting through the UI, API contract, validation, and persistence when it must survive a restart. Keep server and UI types aligned.
- Put Actor specific queries and parsing in `server/providers/`, not in the shared runner or UI. Check that source's captured fixture.
- Preserve dedupe and run history behavior unless the task calls for a change. Do not delete or rewrite existing `data/` content during development.
- Use `npm run typecheck`, `npm run build`, or focused offline tests when needed to verify a material change. The test suite uses fixtures and fake providers.

## Paid work and private data

- A live run calls paid Apify Actors. Do not create an active monitor, click **Run now**, or invoke a live provider as a check without explicit user authorization for that spend. `npm test`, `npm run build`, and `npm run typecheck` do not run paid searches.
- Never commit `.env`, API tokens, `data/`, database files, exports, or raw fetched results. Use `.env.example` for placeholder configuration only.
- The server binds to localhost. Do not expose its unauthenticated API to a public interface as a routine development change.

## Local commands

```sh
npm ci
npm run dev
npm run typecheck
npm run build
npm test
```

Node.js 24 or newer is required. `npm run dev` starts Express on port 4317 and Vite on port 5173. `npm start` builds the UI and runs the combined local server; it also starts the scheduler, so use care with active monitors and a configured Apify token.
