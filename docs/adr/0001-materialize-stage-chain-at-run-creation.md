# Materialize the whole Stage chain at Run creation

The scheduler is a stateless tick with no memory between invocations, so "what runs next" must be readable from the database, not computed from an in-memory event. We create every Stage of the Template as a `pending` row when the Run is created, each gated on its predecessor (`after_stage_id`); an Edge *inserts* Stage rows between the current Stage and its successor and re-points the successor's gate. Each finished Stage carries a `verdict_seen_at` marker so routing acts on it exactly once no matter how many ticks observe it.

## Considered options

- **Lazy creation** (create the next Stage only when the previous one finishes): smaller schema, but "the rest of the plan" cannot be derived once an Edge has re-inserted a Role that also appears in the happy path, and a crash between "Stage done" and "next Stage created" strands the Run.
- **Materialized chain** (chosen): the plan is always fully visible as rows, routing is an insertion, recovery is a query. Borrowed from the reference implementation (`nightshift-playground`, `insertAfterNode` / `VerdictSeen`).

## Consequences

- `seq` uses gaps (10, 20, 30 …) so insertions sort correctly without renumbering.
- The UI can render the entire planned chain from the first second, including not-yet-started Stages.
- Cancelling or terminating a Run must also mark its unstarted `pending` Stages `skipped` so nothing is admitted into a dead chain.
