import { isRunning, runMonitor, type Ctx } from './runner.ts';

/** Run rows left `running` by a previous process can never finish; mark them failed. */
export function repairStaleRuns(ctx: Ctx): number {
  const r = ctx.db
    .prepare("UPDATE runs SET status = 'failed', error = 'interrupted by restart', finished_at = ? WHERE status = 'running'")
    .run(ctx.now().toISOString());
  return Number(r.changes);
}

/**
 * Starts every due, active, idle monitor once. An overdue monitor gets one run, not one per missed interval,
 * because next_run_at is only advanced when its run finishes. Returns the run promises (for tests).
 */
// ponytail: all due monitors start concurrently; add a small concurrency cap if someone runs dozens of monitors.
export function tick(ctx: Ctx): Promise<void>[] {
  const due = ctx.db
    .prepare("SELECT id FROM monitors WHERE status = 'active' AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at, id")
    .all(ctx.now().toISOString()) as Array<{ id: string }>;
  return due.filter((m) => !isRunning(ctx, m.id)).map((m) => runMonitor(ctx, m.id, 'schedule').done);
}

export function startScheduler(ctx: Ctx, intervalMs = 30_000): () => void {
  const repaired = repairStaleRuns(ctx);
  if (repaired) ctx.log(`[scheduler] marked ${repaired} interrupted run(s) as failed`);
  const safeTick = () => {
    try {
      tick(ctx);
    } catch (e) {
      ctx.log(`[scheduler] tick failed: ${(e as Error).message}`);
    }
  };
  const timer = setInterval(safeTick, intervalMs);
  return () => clearInterval(timer);
}
