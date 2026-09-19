import { getHealth } from "@/lib/health";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return json(await getHealth());
}
