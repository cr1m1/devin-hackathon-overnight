import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { runs, stages, type Run, type RunStatus, type Stage } from "@/lib/db/schema";
import { ROLES } from "@/lib/flow/roles";
import { formatDuration } from "@/lib/time";

// Plan §11.6. One batch: run status + reason + summary, pending stages skipped. No model call.

export async function terminateRun(db: Db, run: Run, status: Exclude<RunStatus, "queued" | "running">, reason: string, now = new Date()): Promise<void> {
  const stageRows = await db.select().from(stages).where(eq(stages.runId, run.id)).orderBy(stages.seq);
  const summary = buildSummary({ ...run, status, outcomeReason: reason }, stageRows, now);
  await db.batch([
    db.update(runs).set({ status, outcomeReason: reason, summaryMd: summary, updatedAt: now }).where(eq(runs.id, run.id)),
    db
      .update(stages)
      .set({ status: "skipped", updatedAt: now })
      .where(and(eq(stages.runId, run.id), inArray(stages.status, ["pending"]))),
  ]);
}

export function buildSummary(
  run: Pick<Run, "goal" | "status" | "outcomeReason" | "pullRequests" | "acceptanceCriteria" | "createdAt" | "acuSpent">,
  stageRows: Stage[],
  now: Date,
): string {
  const lines: string[] = [];
  lines.push(`# ${run.goal.trim()}`, "");
  lines.push(`**Result:** ${run.status} — ${run.outcomeReason ?? ""}`.trimEnd());
  lines.push(`**Pull requests:** ${run.pullRequests.length ? run.pullRequests.map((p) => p.url).join(", ") : "none"}`);
  const validate = [...stageRows].reverse().find((s) => s.role === "validate" && s.status === "done");
  if (run.acceptanceCriteria?.length) {
    const passed = validate?.reportMd ? (validate.reportMd.match(/\bPASS\b/g) ?? []).length : 0;
    lines.push(
      `**Acceptance criteria:** ${validate ? `${Math.min(passed, run.acceptanceCriteria.length)} passed / ${run.acceptanceCriteria.length}` : `${run.acceptanceCriteria.length} defined, not validated`}`,
    );
  }
  const first = stageRows.find((s) => s.startedAt)?.startedAt ?? run.createdAt;
  const last = [...stageRows].reverse().find((s) => s.finishedAt)?.finishedAt ?? now;
  lines.push(
    `**Stages:** ${stageRows.filter((s) => s.status !== "skipped").length} · **Elapsed:** ${formatDuration(first, last)} · **ACUs spent:** ${Number(run.acuSpent).toFixed(1)}`,
    "",
  );
  for (const s of stageRows) {
    const title = ROLES[s.role].title;
    if (s.status === "skipped") {
      lines.push(`## ${title} — skipped`, "");
      continue;
    }
    const label = s.status === "done" ? (s.verdict ?? "done") : s.status;
    lines.push(`## ${title} — ${label}`);
    if (s.summary) lines.push(s.summary.trim());
    if (s.error) lines.push(`_${s.error}_`);
    if (s.reportMd) lines.push("", s.reportMd.trim());
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
