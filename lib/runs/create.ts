import { z } from "zod";
import { db } from "@/lib/db/client";
import { runs, stages, type NewStage, type Run, type Stage } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getTemplate } from "@/lib/flow/templates";
import { ROLES } from "@/lib/flow/roles";
import { newRunId, newStageId } from "@/lib/ids";
import { repoRefusalReason } from "@/lib/repos";
import { addMinutes } from "@/lib/time";

// Plan §10 POST /api/runs and ADR-0001: a Run and its whole Template chain are created in one batch.

export const SEQ_STEP = 10;
const MIN_LEAD_MIN = 15;
const MAX_LEAD_H = 48;

export const createRunInput = z.object({
  goal: z.string().trim().min(8, "describe the goal in at least a sentence").max(8000),
  repo: z.string().trim(),
  deadline_at: z.coerce.date(),
  template_id: z.string().default("build"),
});
export type CreateRunInput = z.infer<typeof createRunInput>;

export class CreateRunError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export type CreateRunExtras = { createdIp?: string | null; scheduleId?: string | null; againOfRunId?: string | null };

/** Pure: builds the Run row and its Stage rows without touching the DB (unit-testable). */
export function buildRunRows(input: CreateRunInput, now: Date, extras: CreateRunExtras = {}): { run: typeof runs.$inferInsert; stageRows: NewStage[] } {
  const refusal = repoRefusalReason(input.repo);
  if (refusal) throw new CreateRunError(refusal);

  const lead = input.deadline_at.getTime() - now.getTime();
  if (lead < MIN_LEAD_MIN * 60_000) throw new CreateRunError(`deadline must be at least ${MIN_LEAD_MIN} minutes ahead`);
  if (lead > MAX_LEAD_H * 3_600_000) throw new CreateRunError(`deadline must be within ${MAX_LEAD_H} hours`);

  const template = getTemplate(input.template_id);
  if (template.stages.length > env.maxStagesPerRun) throw new CreateRunError("template exceeds the stage budget", 500);

  const runId = newRunId();
  const run: typeof runs.$inferInsert = {
    id: runId,
    goal: input.goal,
    repo: input.repo,
    templateId: template.id,
    status: "queued",
    deadlineAt: input.deadline_at,
    acuBudget: env.maxAcuPerRun,
    stagesCreated: template.stages.length,
    createdIp: extras.createdIp ?? null,
    scheduleId: extras.scheduleId ?? null,
    againOfRunId: extras.againOfRunId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  let prev: string | null = null;
  const stageRows: NewStage[] = template.stages.map((role, i) => {
    const id = newStageId();
    const row: NewStage = {
      id,
      runId,
      seq: (i + 1) * SEQ_STEP,
      role,
      origin: "template",
      afterStageId: prev,
      status: "pending",
      acuLimit: ROLES[role].acuLimit,
      createdAt: now,
      updatedAt: now,
    };
    prev = id;
    return row;
  });

  return { run, stageRows };
}

export async function createRun(input: CreateRunInput, extras: CreateRunExtras = {}, now = new Date()): Promise<{ run: Run; stages: Stage[] }> {
  const { run, stageRows } = buildRunRows(input, now, extras);
  const [insertedRuns, insertedStages] = await db.batch([db.insert(runs).values(run).returning(), db.insert(stages).values(stageRows).returning()]);
  return { run: insertedRuns[0], stages: insertedStages.sort((a, b) => a.seq - b.seq) };
}

/** "Run again" (§10): same goal/repo/template, deadline = now + the original lead time. */
export function againInputFrom(old: Run, now = new Date()): CreateRunInput {
  const leadMin = Math.max(MIN_LEAD_MIN, Math.round((old.deadlineAt.getTime() - old.createdAt.getTime()) / 60_000));
  return { goal: old.goal, repo: old.repo, template_id: old.templateId, deadline_at: addMinutes(now, Math.min(leadMin, MAX_LEAD_H * 60)) };
}
