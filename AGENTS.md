# Overnight — agent instructions

## Hard rules

- **Never target any repository under the GitHub owner `Namadgi`** (or any owner other than `cr1m1`) with a Run, a Session, a test, or a manual API call. The Devin org connection can reach them; this app must not. Enforced in code by `REPO_ALLOWLIST` (default `cr1m1/*`) and `REPO_DENYLIST` (default `Namadgi/*`) in Admission and in the repository picker — do not weaken either.
- Demo and test Runs use `cr1m1/lalafo-stats` (or another `cr1m1/*` repo the owner names).
- Secrets live only in `.env.local` (gitignored). Never write `DEVIN_API_KEY`, `DATABASE_URL` or the org id into docs, code or commits.

## Project docs

- `CONTEXT.md` — glossary; use its terms verbatim (Run, Stage, Role, Session, Verdict, Outcome, Tick, Admission, Workspace…).
- `docs/adr/` — decisions already made; do not re-litigate without a new ADR.
- `docs/implementation-plan.md` — the build spec.
- `docs/api-notes.md` — verified Devin v3 API facts; the API is v3 only (`/v3/organizations/{org}/…`), v1 returns 403 for this key.

## Environment

- Neon project `proud-haze-21735795`, branch `production`; `neon` CLI is linked in this directory (`.neon`).
- `neon skills` needs Node ≥ 22.20: `source ~/.nvm/nvm.sh && nvm use 26.5.0`.
- Tick is driven by cron-job.org, not Vercel Cron (Hobby plan). See ADR-0002.
