import { currentConnection } from "@/lib/connections";
import { clientIp, errorResponse, json } from "@/lib/http";
import { db } from "@/lib/db/client";
import { createRun, createRunInput } from "@/lib/runs/create";
import { enforceDemoLimit } from "@/lib/runs/rate-limit";
import { listRuns } from "@/lib/runs/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const c = await currentConnection();
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);
  const status = url.searchParams.get("status");
  const rows = (await listRuns(c?.id ?? null, limit)).filter((r) => !status || r.status === status);
  return json({ runs: rows });
}

export async function POST(req: Request) {
  try {
    const c = await currentConnection();
    if (!c) return json({ error: "Connect your Devin account in Settings first." }, 401);
    const input = createRunInput.parse(await req.json());
    const ip = clientIp(req);
    await enforceDemoLimit(db, ip);
    const created = await createRun(input, c, { createdIp: ip });
    return json(created, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
