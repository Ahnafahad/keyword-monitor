import './env.ts';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { classifyContent } from './content-type.ts';
import { listMonitorRows, openDb } from './db.ts';
import { verifiedKeywords } from './match.ts';
import { writeExports } from './runner.ts';
import { isSocialUrl } from './social.ts';
import type { MatchMode, Platform } from './types.ts';

const dataDir = resolve(process.env.DATA_DIR || './data');
const path = join(dataDir, 'monitor.db');
if (!existsSync(path)) throw new Error(`No database at ${path}`);
mkdirSync(join(dataDir, 'backup'), { recursive: true });
const db = openDb(path);
const backupPath = join(dataDir, 'backup', `monitor-before-revalidation-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
db.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);

const monitors = new Map(listMonitorRows(db).map((monitor) => [monitor.id, monitor]));
const rows = db.prepare('SELECT id, platform, title, content, url, matched_keywords FROM results').all() as Array<{
  id: string; platform: Platform; title: string | null; content: string; url: string; matched_keywords: string;
}>;
const associations = db.prepare('SELECT monitor_id FROM result_monitors WHERE result_id = ?');
const removeAssociation = db.prepare('DELETE FROM result_monitors WHERE result_id = ? AND monitor_id = ?');
const update = db.prepare('UPDATE results SET matched_keywords = ?, match_verified = ?, content_type = ?, social_web = ? WHERE id = ?');
const remove = db.prepare('DELETE FROM results WHERE id = ?');
let excluded = 0;
let unverifiedWeb = 0;
let kept = 0;

db.exec('BEGIN IMMEDIATE');
try {
  for (const row of rows) {
    const original = JSON.parse(row.matched_keywords) as string[];
    const item = { title: row.title, content: row.content, matchedKeywords: original };
    const linked = associations.all(row.id) as Array<{ monitor_id: string }>;
    const verified = new Set<string>();
    for (const { monitor_id: id } of linked) {
      const mode: MatchMode = monitors.get(id)?.matchMode ?? 'anywhere';
      const matches = verifiedKeywords(item, mode);
      if (!matches.length && row.platform !== 'web') removeAssociation.run(row.id, id);
      for (const keyword of matches) verified.add(keyword);
    }
    // Results retained when a monitor was deleted still get checked with the default rule.
    if (!linked.length) for (const keyword of verifiedKeywords(item, 'anywhere')) verified.add(keyword);
    if (!verified.size && row.platform !== 'web') {
      remove.run(row.id);
      excluded++;
      continue;
    }
    const matchVerified = verified.size > 0;
    if (!matchVerified) unverifiedWeb++;
    update.run(
      JSON.stringify(matchVerified ? [...verified] : original), Number(matchVerified),
      classifyContent(row), Number(row.platform === 'web' && isSocialUrl(row.url)), row.id,
    );
    kept++;
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  db.close();
  throw error;
}
writeExports(db, dataDir);
db.close();
console.log(JSON.stringify({ backupPath, kept, excluded, unverifiedWeb }));
