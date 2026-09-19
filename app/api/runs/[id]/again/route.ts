import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { clientIp, errorResponse, json } from "@/lib/http";
import { againInputFrom, createRun } from "@/lib/runs/create";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [old] = await db.select().from(runs).where(eq(runs.id, id));
    if (!old) return json({ error: "not found" }, 404);
    const created = await createRun(againInputFrom(old), { createdIp: clientIp(req), againOfRunId: old.id });
    return json(created, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
