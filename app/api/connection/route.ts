import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { connections } from "@/lib/db/schema";
import { claimOrphanRuns, connect, ConnectError, COOKIE, cookieOptions, currentConnection, disconnect } from "@/lib/connections";
import { encryptionConfigured } from "@/lib/crypto";
import { errorResponse, json } from "@/lib/http";
import { REPO_SHAPE } from "@/lib/repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const publicView = (c: Awaited<ReturnType<typeof currentConnection>>) =>
  c && { id: c.id, name: c.name, org_id: c.devinOrgId, key_hint: c.keyHint, repo_allowlist: c.repoAllowlist, repo_denylist: c.repoDenylist, connected_at: c.createdAt };

export async function GET() {
  const c = await currentConnection();
  return json({ connection: publicView(c), encryption_ready: encryptionConfigured() });
}

const connectInput = z.object({ name: z.string().max(80).default("My Devin"), org_id: z.string(), api_key: z.string() });

export async function POST(req: Request) {
  try {
    if (!encryptionConfigured()) return json({ error: "server is missing ENCRYPTION_KEY; connections cannot be stored" }, 503);
    const existing = await currentConnection();
    if (existing) return json({ error: "already connected — disconnect first" }, 409);
    const input = connectInput.parse(await req.json());
    const { connection, token, repos } = await connect({ name: input.name, orgId: input.org_id, apiKey: input.api_key });
    const claimed = await claimOrphanRuns(connection);
    (await cookies()).set(COOKIE, token, cookieOptions());
    return json({ connection: publicView(connection), repos_reachable: repos, claimed_runs: claimed }, 201);
  } catch (e) {
    if (e instanceof ConnectError) return json({ error: e.message }, e.status);
    return errorResponse(e);
  }
}

const listsInput = z.object({
  repo_allowlist: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  repo_denylist: z.array(z.string().trim().max(200)).max(50).optional(),
  name: z.string().trim().min(1).max(80).optional(),
});

const globOk = (g: string) => g === "*/*" || /^[A-Za-z0-9_.-]+\/\*$/.test(g) || REPO_SHAPE.test(g);

export async function PATCH(req: Request) {
  try {
    const c = await currentConnection();
    if (!c) return json({ error: "not connected" }, 401);
    const input = listsInput.parse(await req.json());
    for (const g of [...(input.repo_allowlist ?? []), ...(input.repo_denylist ?? [])])
      if (!globOk(g)) return json({ error: `invalid pattern: ${g} (use owner/*, owner/name or */*)` }, 400);
    const [updated] = await db
      .update(connections)
      .set({
        ...(input.repo_allowlist ? { repoAllowlist: input.repo_allowlist } : {}),
        ...(input.repo_denylist ? { repoDenylist: input.repo_denylist.filter(Boolean) } : {}),
        ...(input.name ? { name: input.name } : {}),
        updatedAt: new Date(),
      })
      .where(eq(connections.id, c.id))
      .returning();
    return json({ connection: publicView(updated) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE() {
  const c = await currentConnection();
  if (c) await disconnect(c);
  (await cookies()).set(COOKIE, "", cookieOptions(0));
  return json({ ok: true });
}
