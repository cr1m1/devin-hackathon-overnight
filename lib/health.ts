import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clientFor, repoAllowedFor } from "@/lib/connections";
import type { Connection } from "@/lib/db/schema";
import { encryptionConfigured } from "@/lib/crypto";
import { env } from "@/lib/env";
import { readLease } from "@/lib/tick/lease";

export type Health = {
  ok: boolean;
  db: "ok" | "error";
  encryption: "ok" | "missing";
  last_tick_at: string | null;
  tick_stale: boolean;
  defaults: { max_stages_per_run: number; max_acu_per_run: number; deadline_nudge_min: number; deadline_grace_min: number };
  version: string;
};

export type ConnectionHealth = {
  devin: "ok" | "error";
  repos_reachable: number;
  repos_allowed: number;
  owners: Record<string, number>;
};

/** Instance health: no credentials involved. */
export async function getHealth(): Promise<Health> {
  let dbState: Health["db"] = "ok";
  let lastTickAt: Date | null = null;
  try {
    await db.execute(sql`select 1`);
    lastTickAt = (await readLease(db))?.lastRunAt ?? null;
  } catch {
    dbState = "error";
  }
  const tickStale = !lastTickAt || Date.now() - lastTickAt.getTime() > 5 * 60_000;
  const encryption = encryptionConfigured() ? "ok" : "missing";
  return {
    ok: dbState === "ok" && !tickStale && encryption === "ok",
    db: dbState,
    encryption,
    last_tick_at: lastTickAt?.toISOString() ?? null,
    tick_stale: tickStale,
    defaults: {
      max_stages_per_run: env.maxStagesPerRun,
      max_acu_per_run: env.maxAcuPerRun,
      deadline_nudge_min: env.deadlineNudgeMin,
      deadline_grace_min: env.deadlineGraceMin,
    },
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
  };
}

/** Per-connection health: is the stored key still accepted, and what can it reach. */
export async function getConnectionHealth(c: Connection): Promise<ConnectionHealth> {
  const owners: Record<string, number> = {};
  try {
    const repos = await clientFor(c).listRepositories();
    let allowed = 0;
    for (const r of repos) {
      const owner = r.repo_path.split("/")[0];
      owners[owner] = (owners[owner] ?? 0) + 1;
      if (repoAllowedFor(c, r.repo_path)) allowed++;
    }
    return { devin: "ok", repos_reachable: repos.length, repos_allowed: allowed, owners };
  } catch {
    return { devin: "error", repos_reachable: 0, repos_allowed: 0, owners };
  }
}

/** For layouts/banners: at most one real check per 60 s per instance. */
export const getHealthCached = unstable_cache(getHealth, ["health"], { revalidate: 60 });
