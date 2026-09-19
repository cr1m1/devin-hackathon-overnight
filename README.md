# Overnight

**Evening — a task. Morning — a pull request.**

Overnight runs multi-stage coding work unattended against a GitHub repository and leaves you, by morning, one readable report and one or more pull requests. You state a goal, pick a repository and a deadline, and close the laptop. Overnight materializes the goal as a chain of stages — `plan → implement → review → validate` — runs each stage as a separate **Devin Cloud session**, routes between stages on each stage's structured verdict (`ok` / `needs-work` / `blocked` / `complete`), inserts `amend` rounds when review finds problems, respects the wall-clock deadline and the ACU budget, and stops with an honest outcome.

Live: **https://overnight-ashy.vercel.app** — no sign-in.

Overnight never writes code itself. It is a stateless scheduler and bookkeeper over Devin sessions; all code work happens inside Devin.

## How it works

```
POST /api/runs            creates the Run and all four Stage rows, gated in order
cron (every minute) ─▶ GET /api/tick
   1. poll     running sessions → a stage is done the moment its structured output parses to a verdict
   2. reconcile lost create responses by tag  (v3 has no idempotency flag)
   3. route    verdict → proceed | insert stages (edge) | terminate run      ← pure function over data
   4. admit    deadline / budget / stage-budget / allowlist gates, claim in DB, then start a session
   5. schedules (recurring runs)
```

- **Routing is data**: `lib/flow/templates.ts` declares the happy path and its exception edges. Adding a stage type never touches the tick.
- **Deadlines are hard**: nothing starts that cannot finish in time; a running stage is nudged 15 min before the deadline and archived 15 min after.
- **Two ticks can never double-start a stage**: a partial unique index (`stages_one_active`) plus a lease row.
- **The morning is the product**: the Inbox and the deterministic run report (no summarizer model) are the deliverable.

Design docs: `docs/implementation-plan.md` (build spec), `CONTEXT.md` (glossary), `docs/adr/` (decisions), `docs/api-notes.md` (verified Devin v3 facts).

## Run it locally

Requirements: Node ≥ 22, a Postgres URL (Neon free tier works), a Devin service-user API key and org id.

```bash
git clone https://github.com/cr1m1/devin-hackathon-overnight.git
cd devin-hackathon-overnight
npm install
cp .env.example .env.local        # fill in the values below
npm run db:migrate                # applies drizzle/ migrations
npm run dev                       # http://localhost:3000
```

`.env.local`:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `DEVIN_API_KEY` | yes | Devin service-user key (`cog_…`) — Settings → Service users |
| `DEVIN_ORG_ID` | yes | `org-…`, shown on the same page |
| `CRON_SECRET` | prod | Shared secret for `/api/tick`; in dev it may be empty |
| `REPO_ALLOWLIST` | no | Default `cr1m1/*` — globs of repositories runs may target |
| `REPO_DENYLIST` | no | Default `Namadgi/*` — refused even if allowlisted |

The first thing to click: **New run** → describe a goal → pick a repository (only allowlisted repos Devin can reach are listed) → **Start the run**. Then drive the scheduler once with `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/tick` (or `?key=…`) — in production an external cron (cron-job.org) calls it every minute. The run page refreshes itself; **Inbox** is the morning screen.

Note: to start real sessions, the Devin org behind the key must have the target repository connected in its GitHub integration, and the allowlist must include it. Sessions consume the org's ACUs (each stage carries a `max_acu_limit`).

```bash
npm run lint && npm run typecheck && npm test   # 52 unit tests (routing, admission, poll mapping, prompt, schema, allowlist)
```

## Deploy

Vercel (Hobby is enough) + Neon. Set the env vars above in Vercel; the build command `npm run db:migrate && npm run build` is in `vercel.json`. Vercel Hobby crons are daily, so create a cron-job.org job hitting `https://<app>/api/tick` every minute with header `Authorization: Bearer <CRON_SECRET>`.

## Status

Built during the Budapest hackathon. Shipped: run creation with repository picker, full stage chain with data-declared routing and `amend` insertion, deadline and budget admission, nudge + grace, tag reconciliation, deterministic reports, Inbox, Settings with health. Not yet: recurring schedules UI, cancel of an in-flight session (archive), workspaces.
