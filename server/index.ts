import './env.ts'; // must stay first: loads .env before other modules read process.env
import { join, resolve } from 'node:path';
import { createApp } from './api.ts';
import { openDb } from './db.ts';
import { getProviders } from './providers/index.ts';
import { createCtx } from './runner.ts';
import { startScheduler } from './scheduler.ts';

const dataDir = resolve(process.env.DATA_DIR || './data');
const port = Number(process.env.PORT) || 4317;

const db = openDb(join(dataDir, 'monitor.db'));
const ctx = createCtx({ db, providers: getProviders(), dataDir });
const stopScheduler = startScheduler(ctx);

const server = createApp(ctx, { staticDir: resolve('dist') }).listen(port, '127.0.0.1', (err?: Error) => {
  if (err) {
    console.error(`Could not start server: ${err.message}`);
    process.exit(1);
  }
  console.log(`Keyword Monitor running at http://localhost:${port}  (data: ${dataDir})`);
});

function shutdown() {
  stopScheduler();
  server.close();
  server.closeAllConnections();
  db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
