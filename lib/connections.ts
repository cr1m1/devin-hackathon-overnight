import { and, eq, inArray, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { customAlphabet } from "nanoid";
import { db } from "@/lib/db/client";
import { connections, runs, stages, type Connection } from "@/lib/db/schema";
import { createDevinClient, verifyCreds, type DevinClient, type DevinCreds } from "@/lib/devin/client";
import { decrypt, encrypt, randomToken, sha256 } from "@/lib/crypto";
import { isRepoAllowed, matchesGlob, REPO_SHAPE } from "@/lib/repos";

// Bring-your-own Devin. A Connection = one user's encrypted credentials + repo lists.
// The browser identifies its Connection with an httpOnly cookie; the tick identifies it via runs.connection_id.

export const COOKIE = "on_conn";
const newConnectionId = () => `con_${customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12)()}`;

export async function currentConnection(): Promise<Connection | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [c] = await db
    .select()
    .from(connections)
    .where(eq(connections.tokenHash, sha256(token)));
  return c ?? null;
}

export async function connectionById(id: string | null): Promise<Connection | null> {
  if (!id) return null;
  const [c] = await db.select().from(connections).where(eq(connections.id, id));
  return c ?? null;
}

export function credsFor(c: Connection): DevinCreds {
  return { apiKey: decrypt(c.devinApiKeyEnc), orgId: c.devinOrgId };
}

export const clientFor = (c: Connection): DevinClient => createDevinClient(credsFor(c));

// Repository policy for a connection: its own lists. The glob "*/*" means everything Devin can reach.
export function repoAllowedFor(c: Pick<Connection, "repoAllowlist" | "repoDenylist">, repo: string): boolean {
  return isRepoAllowed(repo, c.repoAllowlist, c.repoDenylist);
}

export function repoRefusalFor(c: Pick<Connection, "repoAllowlist" | "repoDenylist">, repo: string): string | null {
  if (!REPO_SHAPE.test(repo)) return "repository must look like owner/name";
  if (c.repoDenylist.some((g) => matchesGlob(repo, g))) return `repository ${repo} is on this connection's deny list`;
  if (!c.repoAllowlist.some((g) => matchesGlob(repo, g))) return `repository ${repo} is not on this connection's allow list`;
  return null;
}

export class ConnectError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

/** Validates the key live, stores it encrypted, returns the cookie token (shown to nobody, set as httpOnly). */
export async function connect(input: { name: string; orgId: string; apiKey: string }, now = new Date()): Promise<{ connection: Connection; token: string; repos: number }> {
  const orgId = input.orgId.trim();
  const apiKey = input.apiKey.trim();
  if (!/^org-[A-Za-z0-9-]{8,}$/.test(orgId)) throw new ConnectError("organization id should look like org-…");
  if (!/^cog_[A-Za-z0-9_-]{16,}$/.test(apiKey)) throw new ConnectError("API key should be a Devin service-user key starting with cog_");

  let repos = 0;
  try {
    repos = await verifyCreds({ apiKey, orgId });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) throw new ConnectError("Devin rejected this key for this organization.", 401);
    throw new ConnectError("Could not reach Devin to verify the key. Try again.", 502);
  }

  const token = randomToken();
  const [connection] = await db
    .insert(connections)
    .values({
      id: newConnectionId(),
      name: input.name.trim().slice(0, 80) || "My Devin",
      devinOrgId: orgId,
      devinApiKeyEnc: encrypt(apiKey),
      keyHint: `cog_…${apiKey.slice(-4)}`,
      tokenHash: sha256(token),
      lastVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return { connection, token, repos };
}

/** Removes the credentials. Live runs of this connection are cancelled: nothing can poll them anymore. */
export async function disconnect(c: Connection, now = new Date()): Promise<void> {
  const live = await db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.connectionId, c.id), inArray(runs.status, ["queued", "running"])));
  const ids = live.map((r) => r.id);
  const ops = [
    ...(ids.length
      ? [
          db.update(runs).set({ status: "cancelled", outcomeReason: "cancelled — Devin connection removed", updatedAt: now }).where(inArray(runs.id, ids)),
          db
            .update(stages)
            .set({ status: "skipped", updatedAt: now })
            .where(and(inArray(stages.runId, ids), inArray(stages.status, ["pending", "starting", "running"]))),
        ]
      : []),
    db.delete(connections).where(eq(connections.id, c.id)),
  ];
  await db.batch(ops as unknown as Parameters<typeof db.batch>[0]);
}

/** One-time: runs created before connections existed are claimed by the first connection with the same org. */
export async function claimOrphanRuns(c: Connection): Promise<number> {
  const r = await db.update(runs).set({ connectionId: c.id }).where(isNull(runs.connectionId)).returning({ id: runs.id });
  return r.length;
}

export const cookieOptions = (maxAgeSec = 60 * 60 * 24 * 365) =>
  ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: maxAgeSec }) as const;
