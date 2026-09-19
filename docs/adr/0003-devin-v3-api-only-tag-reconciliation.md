# Devin v3 API only; idempotency by DB claim + tag reconciliation

The project's Devin credential is a service-user key (`cog_…`), which the v3 organization API accepts and the v1/v2 APIs reject (verified: 403 on every v1 route). We therefore build exclusively on `https://api.devin.ai/v3/organizations/{DEVIN_ORG_ID}/…`, with `DEVIN_ORG_ID` a required setting, and keep no v1 fallback code.

v3 has **no `idempotent` flag** on session creation, so "never start a Stage twice" is guaranteed by us alone: a Stage row is claimed in the database (`status='starting'`, guarded by the partial unique index `stages_one_active`) *before* the create call, and every Session is tagged `stage:<stage_id>`. If the create response is lost, the next Tick finds the Session by that tag and adopts it; a Stage is never re-created while a tagged Session for it exists. Stage completion is defined as "structured output parses to a valid Verdict", independent of the Session's `status`/`status_detail` — a finished Devin normally idles in `running / waiting_for_user`, not in a terminal state.

## Consequences

- Real spend (`acus_consumed`) and explicit suspension reasons (`out_of_credits`, `usage_limit_exceeded`, …) are available on every poll; the UI shows spent ACUs, never estimates.
- `repos: ["owner/name"]` binds the Session to the repository; `resumable: false` marks Stage Sessions disposable.
- Tag reconciliation is a hot-path feature with its own tests, not a rarely-exercised safety net.
- Migrating to a personal access token or another org is a settings change, not a code change.
