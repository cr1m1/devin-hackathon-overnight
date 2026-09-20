import { currentConnection } from "@/lib/connections";
import { errorResponse, json } from "@/lib/http";
import { deleteSchedule, updateSchedule } from "@/lib/schedules/store";
import { schedulePatch } from "@/lib/schedules/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const c = await currentConnection();
    if (!c) return json({ error: "not connected" }, 401);
    const patch = schedulePatch.parse(await req.json());
    const updated = await updateSchedule(id, patch, c);
    if (!updated) return json({ error: "not found" }, 404);
    return json({ schedule: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const c = await currentConnection();
    if (!c) return json({ error: "not connected" }, 401);
    const ok = await deleteSchedule(id, c.id);
    if (!ok) return json({ error: "not found" }, 404);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
