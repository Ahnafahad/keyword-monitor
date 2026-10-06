# Setup guide

Keyword Monitor is a local, single user web app. One Node.js process serves the UI and API, stores data in SQLite, and schedules searches through Apify.

## Requirements

- [Node.js](https://nodejs.org/) 24 or newer, with npm
- An [Apify](https://apify.com/) account and API token for live searches
- Internet access for live searches

Each search can use paid Apify credit. Check your plan and the Actors' current prices before creating an active monitor. Saving one schedules its first search immediately. Fewer keywords, fewer sources, a smaller item cap, and a longer frequency reduce usage. Prices in [PROVIDERS.md](../PROVIDERS.md) are historical examples, not a current quote.

## Install

Clone the repository using its GitHub URL, enter the project directory, and install its locked dependencies:

```sh
git clone <repository-url>
cd keyword-monitor
npm ci
```

Use the actual clone URL in place of `<repository-url>`. If you downloaded a ZIP without `package-lock.json`, use `npm install`.

Copy the environment template:

| System | Command |
| --- | --- |
| Windows PowerShell | `Copy-Item .env.example .env` |
| macOS or Linux | `cp .env.example .env` |

Edit `.env` and set `APIFY_API_TOKEN` to your own token. Keep `.env` private. Optional settings are listed in [.env.example](../.env.example).

Start the app:

```sh
npm start
```

Open <http://127.0.0.1:4317>. Leave the terminal running for scheduled searches and press Ctrl+C to stop. `npm start` builds the UI before starting the server. If you set `PORT`, use that port instead. The server binds to your own computer only; it is not configured for public hosting or multiple users.

## Create a monitor

1. Select **New monitor** and enter a name and keyword phrases. Each phrase is searched separately.
2. Choose sources: LinkedIn, X, Web, or a combination. The Web option can exclude common social sites from Web searches and hide previously stored Web results from those sites in this monitor's feed. LinkedIn and X remain separate source choices.
3. Choose whether the words in each keyword can appear anywhere or must appear within 20 words. Common role and location variants count.
4. Choose the result types to surface: jobs, people, news, courses, or other. These categories use text heuristics and filter the feed; changing the selection does not trigger another paid search.
5. Set the initial lookback and frequency. Choose your Apify plan to review the estimated weekly Actor charges, then save. Minimum frequency is 15 minutes.

The monitor and run history show whether each source succeeded, failed, or was throttled. **Run now** starts another paid search. Pause a monitor to stop scheduled searches. Repeat results are deduplicated in the database, although fetching them again can still incur provider charges. A Web result may remain in the feed with a warning when its title and snippet cannot verify the keyword; the search engine may have matched page text that is not shown.

## Development

```sh
npm run dev
```

The API and scheduler run on <http://127.0.0.1:4317>; Vite serves the development UI on <http://localhost:5173> and proxies `/api` to port 4317. Server edits trigger a restart. If you change `PORT`, update the proxy in [vite.config.ts](../vite.config.ts) for development.

| Command | Purpose |
| --- | --- |
| `npm run build` | Build the UI into `dist/` |
| `npm run typecheck` | Check server and UI TypeScript |
| `npm test` | Run the offline tests |

The tests use fixtures and fake providers, so they do not require a token or spend Apify credit.

## Data and backups

By default, the database is `data/monitor.db`. SQLite can create `monitor.db-wal` and `monitor.db-shm` beside it while running. After each monitor run, the app rewrites `data/export/results.jsonl`, `monitors.json`, and `runs.jsonl`. Set `DATA_DIR` in `.env` to move this directory. Stop the app before copying the database for a simple backup.

Database files, exports, and raw provider payloads can contain names and profile links; keep them private. The `/api/export/*` endpoints expose the same exports while the app is running. The full API contract is in [server/types.ts](../server/types.ts).

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Cannot connect to Apify | Verify `APIFY_API_TOKEN`, restart, and check Settings. |
| Source failed or throttled | Read its run error; check your Apify account and Actor before retrying. |
| No recent results | Check source selection, keywords, lookback, match rule, result types, and run status. |
| Port in use | Stop the other process or set `PORT`; adjust the Vite proxy for development. |
| UI missing on port 4317 | Run `npm start` or build the UI before starting the server directly. |
