# Overnight

**Evening — a task. Morning — a pull request.**

Overnight runs multi-stage coding work unattended against a GitHub repository and leaves you, by morning, one readable report and one or more pull requests. You state a goal, pick a repository and a deadline, and close the laptop. Overnight materializes the goal as a chain of stages — `plan → implement → review → validate` — runs each stage as a separate **Devin Cloud session**, routes between stages on each stage's structured verdict (`ok` / `needs-work` / `blocked` / `complete`), inserts `amend` rounds when review finds problems, respects the wall-clock deadline and the ACU budget, and stops with an honest outcome.

Live: **https://overnight-ashy.vercel.app** — no account needed. **Bring your own Devin:** open Settings, paste your Devin organization id and a service-user API key; sessions run in *your* organization against repositories *your* Devin can reach. The key is verified once, stored encrypted (AES-256-GCM), and never shown again. Nothing is shared between users.

Overnight never writes code itself. It is a stateless scheduler and bookkeeper over Devin sessions; all code work happens inside Devin.

## How it works

```
POST /api/runs            creates the Run and all four Stage rows, gated in order
cron (every minute) ─▶ GET /api/tick
   1. poll     running sessions → a stage is done the moment its structured output parses to a verdict
   2. reconcile lost create responses by tag  (v3 has no idempotency flag)
   3. route    verdict → proceed | insert stages (edge) | terminate run      ← pure function over data
   4. admit    deadline / budget / stage-budget / allowlist gates, claim in DB, then start a session
   5. schedules (recurring runs): each enabled schedule fires once per local day at its start time
```

- **Routing is data**: `lib/flow/templates.ts` declares the happy path and its exception edges. Adding a stage type never touches the tick.
- **Deadlines are hard**: nothing starts that cannot finish in time; a running stage is nudged 15 min before the deadline and archived 15 min after.
- **Schedules** (Settings → Schedules, `/api/schedules`): a name, goal, repository, a start time and a deadline time in an IANA time zone. The tick creates the run through the same path as `POST /api/runs` (same repo rules), with the deadline at the next occurrence of the deadline time; `last_fired_on` is claimed before the run is created so overlapping ticks fire at most once per day (if run creation then fails — e.g. the repo is refused — the day is skipped and the error is in the tick result). A schedule created or re-enabled after its start time waits for the next day rather than firing immediately.
- **Two ticks can never double-start a stage**: a partial unique index (`stages_one_active`) plus a lease row.
- **The morning is the product**: the Inbox and the deterministic run report (no summarizer model) are the deliverable.

Design docs: `docs/implementation-plan.md` (build spec), `CONTEXT.md` (glossary), `docs/adr/` (decisions), `docs/api-notes.md` (verified Devin v3 facts).

## Run it locally

Requirements: Node ≥ 22, a Postgres URL (Neon free tier works). Devin credentials are entered in the app (Settings), not in env.

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
| `ENCRYPTION_KEY` | yes | 32 bytes hex (`openssl rand -hex 32`) — encrypts stored Devin keys |
| `CRON_SECRET` | prod | Shared secret for `/api/tick`; in dev it may be empty |

The first thing to click: **Settings → Connect Devin** (organization id + service-user key from Devin → Settings → Service users, Member role). Then **New run** → describe a goal → pick a repository (only repos your Devin can reach, filtered by your allow/deny rules) → **Start the run**. Then drive the scheduler once with `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/tick` (or `?key=…`) — in production an external cron (cron-job.org) calls it every minute. The run page refreshes itself; **Inbox** is the morning screen.

Note: the Devin org behind your key must have the target repository connected in its GitHub integration. Sessions consume that org's ACUs (each stage carries a `max_acu_limit`). Per-connection allow/deny rules (e.g. `personal/*` allowed, `work-org/*` denied) are edited in Settings.

```bash
npm run lint && npm run typecheck && npm test   # unit tests (routing, admission, poll mapping, prompt, schema, allowlist, schedules)
```

## Deploy

Vercel (Hobby is enough) + Neon. Set `DATABASE_URL`, `ENCRYPTION_KEY`, `CRON_SECRET` in Vercel; the build command `npm run db:migrate && npm run build` is in `vercel.json`. Vercel Hobby crons are daily, so create a cron-job.org job hitting `https://<app>/api/tick` every minute with header `Authorization: Bearer <CRON_SECRET>`.

## Status

Built during the Budapest hackathon. Shipped: bring-your-own Devin connections (encrypted at rest, per-connection repo rules), run creation with repository picker, full stage chain with data-declared routing and `amend` insertion, deadline and budget admission, nudge + grace, tag reconciliation, deterministic reports, Inbox, Settings with health. Cancel archives the in-flight session. Recurring schedules with enable/disable in Settings. Not yet: multiple connections per browser.
