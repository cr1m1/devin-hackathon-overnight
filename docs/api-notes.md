# Devin API notes — verified findings

Live-checked on 2026-09-19 against `https://api.devin.ai` with the project's service-user key. Resolves the `[verify]` items in `implementation-plan.md`.

## 1. Authentication and API version

- The key is a **service-user credential** (`cog_` prefix). It is **v3-only**: every v1 endpoint (`/v1/sessions`, `/v1/knowledge`, `/v1/secrets`) and `/v2/enterprise/*` return `403 {"detail":"Unauthorized"}`.
- All calls go to `https://api.devin.ai/v3/organizations/{DEVIN_ORG_ID}/...`. `DEVIN_ORG_ID` is therefore **required**, not optional.
- `GET /v3/organizations/{org}/sessions` → `200`. Confirmed working.
- Decision §19 "build on v1, not v3" is void. Build on v3.

## 2. Session endpoints (v3, organization scope)

| Purpose | Call |
|---|---|
| Start | `POST /v3/organizations/{org}/sessions` |
| Poll | `GET /v3/organizations/{org}/sessions/{devin_id}` — `devin_id` is `devin-` + `session_id` |
| Reconcile by tag | `GET /v3/organizations/{org}/sessions?tags=<tag>&first=10` (also supports `session_ids`, `created_after`, `updated_after`, `is_archived`) |
| Message | `POST /v3/organizations/{org}/sessions/{devin_id}/messages` body `{ "message": string }` (note **plural** `messages`) |
| Terminate | `DELETE /v3/organizations/{org}/sessions/{devin_id}` |
| Archive (stop + sleep) | `POST /v3/organizations/{org}/sessions/{devin_id}/archive` |

List response shape: `{ items: SessionResponse[], end_cursor, has_next_page, total }`.

## 3. Create request — fields that exist in v3

`prompt` (required), `title`, `tags: string[]`, `structured_output_schema` (JSON Schema Draft 7, self-contained, ≤ 64 KB), `structured_output_required` (default **true**: agent must call `provide_structured_output(is_final=true)` before its turn ends), `max_acu_limit: integer`, `repos: string[]`, `playbook_id`, `child_playbook_id`, `knowledge_ids`, `secret_ids`, `session_secrets`, `attachment_urls`, `session_links`, `devin_mode` (`normal|fast|lite|ultra|fusion`), `resumable` (default true; set **false** for disposable sessions), `bypass_approval`, `platform`, `create_as_user_id`.

**Not present in v3** (plan §9.2 must drop them): `idempotent`, `unlisted`, `snapshot_id`. Environment comes from the org's blueprint/snapshot configured per repo, not per call.

Idempotency therefore rests **entirely** on our DB (`stages_one_active` + claim-before-call) plus tag-based reconciliation. There is no server-side dedupe.

## 4. Session response — status model

There is **no `status_enum`**. Two fields:

- `status`: `new | claimed | running | exit | error | suspended | resuming`
- `status_detail` (nullable):
  - when `running`: `working`, `waiting_for_user`, `waiting_for_approval`, `finished`
  - when `suspended`: `inactivity`, `user_request`, `usage_limit_exceeded`, `out_of_credits`, `out_of_quota`, `no_quota_allocation`, `payment_declined`, `org_usage_limit_exceeded`, `user_usage_limit_exceeded`, `total_session_limit_exceeded`, `error`

Observed live: a session that had completed its work and was idle showed `status=running, status_detail=waiting_for_user`. This is the normal "Devin is done and waiting" state — it is **not** a signal that a human is required.

Other response fields: `session_id`, `url`, `acus_consumed: number` (fractional), `structured_output: object | null` ("validated structured output; only populated on get/list"), `pull_requests: [{ pr_url, pr_state }]` (array, not single), `tags`, `title`, `created_at`/`updated_at` (**unix seconds, integers**), `playbook_id`, `automation_id`, `is_archived`, `devin_mode`.

## 5. Consequences for the plan

- **Stage completion** = `structured_output` parses to a valid verdict, checked on every poll regardless of `status`/`status_detail`. `waiting_for_user` **without** parseable output → nudge once, then verdict `blocked`. `finished`/`exit` without output → malformed-output row.
- **Needs-human / out-of-money** are now explicit: `status=suspended` with `status_detail` in the usage/credit family → terminate the run with that reason verbatim. `waiting_for_approval` → same as `waiting_for_user`.
- **ACU accounting is real**: `acus_consumed` is on every GET. Store as `numeric`; label "spent". Keep the reservation (`max_acu_limit`) only as the admission-gate upper bound.
- **`repos`** should be sent explicitly (`["owner/name"]`) — this is the authoritative repo binding, not the prompt text.
- **`resumable: false`** for every stage session: they are disposable by design (one session per stage, never continued).
- Timestamps are unix seconds; convert on ingest.
- `pull_requests` is an array; merge it with `structured_output.pull_requests` (a Run may produce a PR stack — plan §8.2, §9.4).

## 6. Adjacent platform features (evaluated, not adopted)

- **Automations** (`/v3/organizations/{org}/automations`) with a Schedule trigger start sessions on a cron — a possible replacement for our `schedules` table, but they create a *single* session, not a multi-stage run. Not a fit for v1.
- **Dynamic Workflows** — Devin can itself write and run a Python orchestrator across child sessions with structured hand-off and resumability. This overlaps with our core loop; the differentiator of this product must be the *unattended, deadline- and budget-governed* layer plus the morning report, not the orchestration primitive itself.
- **Devin Review** (`/v3/organizations/{org}/pr-reviews`) — could replace or back the `review` stage later.

## 7. Still open

- cron-job.org (not Vercel Cron) drives `/api/tick`; free tier request timeout is 30 s → tick must finish in ≈25 s.
- No `idempotent` flag: a lost create response is recovered only via `tags` reconciliation — the reconciler is now on the hot path, not a safety net.
