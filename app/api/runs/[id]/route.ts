import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs, stages } from "@/lib/db/schema";
import { errorResponse, json } from "@/lib/http";
import { getRunWithStages } from "@/lib/runs/queries";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const data = await getRunWithStages(id);
  return data ? json(data) : json({ error: "not found" }, 404);
}

// PATCH {action:"cancel"} — full behaviour (archive the active Session) lands in M4; M1 handles the
// no-active-Stage case so the button works on a queued Run.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "cancel") return json({ error: "unknown action" }, 400);

    const data = await getRunWithStages(id);
    if (!data) return json({ error: "not found" }, 404);
    if (!["queued", "running"].includes(data.run.status)) return json({ run: data.run });

    const active = data.stages.find((s) => s.status === "starting" || s.status === "running");
    if (active) return json({ error: "cancelling a running stage is not available yet" }, 501);

    const now = new Date();
    const [updated] = await db.batch([
      db.update(runs).set({ status: "cancelled", outcomeReason: "cancelled by user", updatedAt: now }).where(eq(runs.id, id)).returning(),
      db.update(stages).set({ status: "skipped", updatedAt: now }).where(eq(stages.runId, id)),
    ]);
    return json({ run: updated[0] });
  } catch (e) {
    return errorResponse(e);
  }
}
