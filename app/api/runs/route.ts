import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { RUN_STATUSES, runs, type RunStatus } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { clientIp, errorResponse, json } from "@/lib/http";
import { createRun, createRunInput } from "@/lib/runs/create";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);
  const where = status && (RUN_STATUSES as readonly string[]).includes(status) ? eq(runs.status, status as RunStatus) : undefined;
  const rows = await db.select().from(runs).where(where).orderBy(desc(runs.createdAt)).limit(limit);
  return json({ runs: rows });
}

export async function POST(req: Request) {
  try {
    const input = createRunInput.parse(await req.json());
    const ip = clientIp(req);

    if (env.demoMode && ip) {
      const tenMinAgo = new Date(Date.now() - 10 * 60_000);
      const recent = await db
        .select({ id: runs.id })
        .from(runs)
        .where(and(eq(runs.createdIp, ip), gt(runs.createdAt, tenMinAgo), inArray(runs.status, ["queued", "running", "complete", "partial", "blocked", "failed", "cancelled"])))
        .limit(1);
      if (recent.length) return json({ error: "demo instance: one run per 10 minutes per address" }, 429);
    }

    const created = await createRun(input, { createdIp: ip });
    return json(created, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
