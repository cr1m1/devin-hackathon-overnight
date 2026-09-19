import { currentConnection } from "@/lib/connections";
import { allowedRepos } from "@/lib/devin/repos";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const c = await currentConnection();
  if (!c) return json({ repos: [], error: "Connect your Devin account in Settings first." }, 401);
  const q = new URL(req.url).searchParams.get("q")?.toLowerCase() ?? "";
  try {
    const repos = (await allowedRepos(c)).filter((r) => !q || r.path.toLowerCase().includes(q));
    return json({ repos });
  } catch (e) {
    console.error(e);
    return json({ repos: [], error: "Could not list repositories from Devin." }, 502);
  }
}
