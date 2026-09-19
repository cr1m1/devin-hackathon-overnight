# Overnight

A hosted service that runs a multi-stage coding goal unattended against a repository, inside a wall-clock deadline and a spend budget, and produces one readable report and one pull request by morning. The morning is the product: the deliverable is the Inbox and the Run report, not the sessions that produced them. It never writes code itself; every stage is a separate Devin Cloud session.

## Language

**Workspace**:
A named grouping of Runs and Schedules (e.g. "Job", "Personal") with its own repository allowlist and default Template. A guardrail on what this app will point Devin at — not an access boundary; without sign-in anyone at the URL can switch Workspaces.
_Avoid_: tenant, account, organization (that word belongs to Devin)

**Repository allowlist**:
The Workspace's list of repository patterns a Run may target. Enforced by the repository picker and by Admission. It does not limit what a Session can reach — only Devin's own integration settings and Security Profiles do.

**Acceptance criteria**:
The checklist of conditions that mean the Run's goal is met, written by the `plan` Stage from the goal, the ticket and the repository, and checked one by one by the Acceptance Stage.

**Run**:
One goal against one repository with one deadline and one budget, executed as an ordered chain of Stages. It yields one Report and one or more pull requests (a stack, when `plan` splits the work). A Run always ends with an explicit outcome and a reason.
_Avoid_: flow, job, task, pipeline

**Stage**:
One unit of the chain, performed by exactly one fresh Session and ending in exactly one Verdict. A Stage is never resumed or continued; a repeat of the same Role is a new Stage.
_Avoid_: node, step, phase

**Role**:
The kind of work a Stage does (`plan`, `implement`, `review`, `amend`, `validate`). A Role has a fixed instruction, a time estimate and a spend cap.

**Session**:
The Devin Cloud session that performs one Stage. Owned by Devin; the Run only starts, polls, nudges and stops it.

**Verdict**:
The Stage's structured outcome, one of `ok`, `needs-work`, `blocked`, `complete`. The only thing routing may read.
_Avoid_: status, result, outcome (those belong to the Run)

**Completion** (of a Stage):
The moment a Session's structured output parses to a valid Verdict. Independent of the Session's own lifecycle state; a Session that is idle without a Verdict is not complete.

**Template**:
The declared happy-path sequence of Roles for a Run plus its Edges and Acceptance Role. Pure data.

**Edge**:
A declared exception: when a given Role returns `needs-work`, insert these Roles after it. The only form routing may take.

**Acceptance Stage**:
The Stage whose Verdict decides the Run. Only it may return `complete`; from any other Stage `complete` is read as `ok`.

**Outcome**:
The terminal state of a Run: `complete`, `partial`, `blocked`, `failed` or `cancelled`, always with a human-readable reason. `partial` means a pull request exists but the Acceptance Stage did not pass it; a Run that stopped before any pull request is `failed` (or `blocked` when a Stage asked for a human), however many Stages succeeded.

**Report**:
The Markdown deliverable of a Stage (what was found, changed, verified, and not done). Never a transcript. The Run's report is assembled from Stage Reports without any model call.

**Handoff**:
The single most useful thing the previous Stage tells the next one to focus on.
_Avoid_: hint, notes

**Tick**:
One stateless pass of the scheduler over all Runs, triggered externally on a fixed interval. Any two Ticks may overlap or run on different machines.

**Admission**:
The decision, made at each Tick, whether a pending Stage may start now: enough time before the deadline, enough budget, enough Stage budget, Run not cancelled.

**Stage budget**:
The lifetime cap on the number of Stages a Run may ever create. The loop guard for Edges.

**Cancel**:
A user action that ends a Run now: the active Session is put to sleep (archived, not destroyed), unstarted Stages are skipped, and the Outcome is `cancelled`. A cancelled Run is never resumed in v1.
_Avoid_: stop, kill, abort

**Run again**:
Creating a new Run from an existing one's goal, repository and budget with a fresh deadline. It starts from the first Stage; nothing is carried over.
_Avoid_: revive, resume, retry, restart

**Nudge**:
A single message sent into a Session that appears stuck, asking it to finish and return a Verdict.
