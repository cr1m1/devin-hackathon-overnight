import { currentConnection } from "@/lib/connections";
import { errorResponse, json } from "@/lib/http";
import { createSchedule, listSchedules } from "@/lib/schedules/store";
import { scheduleInput } from "@/lib/schedules/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_CONNECTED = { error: "Connect your Devin account in Settings first." };

export async function GET() {
  const c = await currentConnection();
  if (!c) return json(NOT_CONNECTED, 401);
  return json({ schedules: await listSchedules(c.id) });
}

export async function POST(req: Request) {
  try {
    const c = await currentConnection();
    if (!c) return json(NOT_CONNECTED, 401);
    const input = scheduleInput.parse(await req.json());
    return json({ schedule: await createSchedule(input, c) }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
