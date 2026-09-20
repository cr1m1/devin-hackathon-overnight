import { currentConnection } from "@/lib/connections";
import { clientIp, errorResponse, json } from "@/lib/http";
import { db } from "@/lib/db/client";
import { againInputFrom, createRun } from "@/lib/runs/create";
import { enforceDemoLimit } from "@/lib/runs/rate-limit";
import { getRunWithStages } from "@/lib/runs/queries";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const c = await currentConnection();
    if (!c) return json({ error: "not connected" }, 401);
    const old = await getRunWithStages(id, c.id);
    if (!old) return json({ error: "not found" }, 404);
    const ip = clientIp(req);
    await enforceDemoLimit(db, ip);
    const created = await createRun(againInputFrom(old.run), c, { createdIp: ip, againOfRunId: old.run.id });
    return json(created, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
