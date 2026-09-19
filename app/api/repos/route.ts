import { devinConfigured } from "@/lib/devin/client";
import { allowedRepos } from "@/lib/devin/repos";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!devinConfigured()) return json({ repos: [], error: "Devin is not configured" }, 503);
  const q = new URL(req.url).searchParams.get("q")?.toLowerCase() ?? "";
  try {
    const repos = (await allowedRepos()).filter((r) => !q || r.path.toLowerCase().includes(q));
    return json({ repos });
  } catch (e) {
    console.error(e);
    return json({ repos: [], error: "could not list repositories" }, 502);
  }
}
