import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { devinConfigured, listRepositories } from "@/lib/devin/client";
import { env } from "@/lib/env";
import { isRepoAllowed } from "@/lib/repos";
import { readLease } from "@/lib/tick/lease";

export type Health = {
  ok: boolean;
  db: "ok" | "error";
  devin: "ok" | "unconfigured" | "error";
  repos_reachable: number;
  repos_allowed: number;
  owners: Record<string, number>;
  last_tick_at: string | null;
  tick_stale: boolean;
  allowlist: string[];
  denylist: string[];
  defaults: { max_stages_per_run: number; max_acu_per_run: number; deadline_nudge_min: number; deadline_grace_min: number };
  version: string;
};

export async function getHealth(): Promise<Health> {
  let dbState: Health["db"] = "ok";
  let lastTickAt: Date | null = null;
  try {
    await db.execute(sql`select 1`);
    lastTickAt = (await readLease(db))?.lastRunAt ?? null;
  } catch {
    dbState = "error";
  }

  let devin: Health["devin"] = devinConfigured() ? "ok" : "unconfigured";
  const owners: Record<string, number> = {};
  let reachable = 0;
  let allowed = 0;
  if (devin === "ok") {
    try {
      const repos = await listRepositories();
      reachable = repos.length;
      for (const r of repos) {
        const owner = r.repo_path.split("/")[0];
        owners[owner] = (owners[owner] ?? 0) + 1;
        if (isRepoAllowed(r.repo_path)) allowed++;
      }
    } catch {
      devin = "error";
    }
  }

  const tickStale = !lastTickAt || Date.now() - lastTickAt.getTime() > 5 * 60_000;
  return {
    ok: dbState === "ok" && devin === "ok" && !tickStale,
    db: dbState,
    devin,
    repos_reachable: reachable,
    repos_allowed: allowed,
    owners,
    last_tick_at: lastTickAt?.toISOString() ?? null,
    tick_stale: tickStale,
    allowlist: env.repoAllowlist,
    denylist: env.repoDenylist,
    defaults: {
      max_stages_per_run: env.maxStagesPerRun,
      max_acu_per_run: env.maxAcuPerRun,
      deadline_nudge_min: env.deadlineNudgeMin,
      deadline_grace_min: env.deadlineGraceMin,
    },
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
  };
}

/** For layouts/banners: at most one real check per 60 s per instance. */
export const getHealthCached = unstable_cache(getHealth, ["health"], { revalidate: 60 });
