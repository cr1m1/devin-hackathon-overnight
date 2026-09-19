import { and, eq, inArray } from "drizzle-orm";
import { clientFor, currentConnection } from "@/lib/connections";
import { db } from "@/lib/db/client";
import { runs, stages } from "@/lib/db/schema";
import { errorResponse, json } from "@/lib/http";
import { getRunWithStages } from "@/lib/runs/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const c = await currentConnection();
  const data = await getRunWithStages(id, c?.id ?? null);
  return data ? json(data) : json({ error: "not found" }, 404);
}

// PATCH {action:"cancel"}: run cancelled, pending stages skipped, the active session archived (put to sleep).
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const c = await currentConnection();
    if (!c) return json({ error: "not connected" }, 401);
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "cancel") return json({ error: "unknown action" }, 400);

    const data = await getRunWithStages(id, c.id);
    if (!data) return json({ error: "not found" }, 404);
    if (!["queued", "running"].includes(data.run.status)) return json({ run: data.run });

    const now = new Date();
    const active = data.stages.find((s) => s.status === "starting" || s.status === "running");
    if (active?.sessionId) {
      try {
        await clientFor(c).archiveSession(active.sessionId);
      } catch {
        /* benign: the session may already have exited */
      }
    }
    const [updated] = await db.batch([
      db.update(runs).set({ status: "cancelled", outcomeReason: "cancelled by user", updatedAt: now }).where(eq(runs.id, id)).returning(),
      db
        .update(stages)
        .set({ status: "skipped", updatedAt: now })
        .where(and(eq(stages.runId, id), eq(stages.status, "pending"))),
      ...(active
        ? [
            db
              .update(stages)
              .set({ status: "failed", error: "cancelled", finishedAt: now, updatedAt: now })
              .where(inArray(stages.id, [active.id])),
          ]
        : []),
    ] as unknown as Parameters<typeof db.batch>[0]);
    return json({ run: (updated as { status: string }[])[0] });
  } catch (e) {
    return errorResponse(e);
  }
}
