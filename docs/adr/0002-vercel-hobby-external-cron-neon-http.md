# Vercel Hobby + external cron + Neon over HTTP, guarded by a lease row

The scheduler is a single `/api/tick` route on Vercel's Hobby plan. Hobby crons fire at most once a day, so the one-minute heartbeat comes from **cron-job.org** (free, 1-minute interval, custom `Authorization` header, 30 s request timeout). Postgres is **Neon** via the `@neondatabase/serverless` **HTTP** driver, and overlapping Ticks are prevented by a **lease row** (`tick_lock.locked_until`, one conditional `UPDATE`) rather than a Postgres advisory lock.

## Why not the obvious choices

- **Vercel Cron**: requires the Pro plan for sub-daily schedules. Not available.
- **Advisory lock**: session-scoped; nonexistent over the HTTP driver and able to outlive a timed-out invocation over pooled connections, which would wedge the scheduler permanently. The lease expires by itself.
- **WebSocket driver / interactive transactions**: every atomic step we need is a fixed statement list, so `db.batch()` over HTTP suffices and avoids per-invocation connection management.

## Consequences

- The Tick must finish in ~25 s (cron-job.org cuts the request at 30 s): poll at most 8 Stages, start at most 3, Devin request timeout 10 s.
- The lease is a burst guard only; correctness against double-starting a Stage rests on the unique indexes (`stages_one_active`, `stages_idem_uniq`).
- `tick_lock.last_run_at` is the source for the "last tick" health check.
- Moving to Vercel Pro later is a one-line `vercel.json` change plus deleting the cron-job.org job; nothing in the code knows who calls it.
