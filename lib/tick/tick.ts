import type { Db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { acquireLease, recordResult } from "./lease";

// Plan §11. M1 ships the guard and the phase skeleton; phases fill in over M2–M5.
// Every phase is a function of (db, now) with no module-level state (§2.1).

export type TickResult = {
  ticked: boolean;
  reason?: string;
  polled: number;
  routed: number;
  started: number;
  fired: number;
  skipped_phases: string[];
  errors: string[];
  ms: number;
};

type Phase = { name: string; run: (ctx: TickContext) => Promise<void> };

export type TickContext = {
  db: Db;
  now: Date;
  result: TickResult;
  deadline: number; // epoch ms after which remaining phases are skipped
};

const PHASE_BUDGET_MS = 20_000;

export const phases: Phase[] = [
  { name: "poll", run: async () => {} },
  { name: "reconcile", run: async () => {} },
  { name: "route", run: async () => {} },
  { name: "admit", run: async () => {} },
  { name: "schedules", run: async () => {} },
];

export async function runTick(db: Db, now = new Date()): Promise<TickResult> {
  const started = Date.now();
  const result: TickResult = { ticked: false, polled: 0, routed: 0, started: 0, fired: 0, skipped_phases: [], errors: [], ms: 0 };

  let leased = false;
  try {
    leased = await acquireLease(db, env.tickLeaseSec, now);
  } catch (e) {
    result.errors.push(`db: ${msg(e)}`);
    result.ms = Date.now() - started;
    return result;
  }
  if (!leased) {
    result.reason = "locked";
    result.ms = Date.now() - started;
    return result;
  }

  result.ticked = true;
  const ctx: TickContext = { db, now, result, deadline: started + PHASE_BUDGET_MS };
  for (const phase of phases) {
    if (Date.now() > ctx.deadline) {
      result.skipped_phases.push(phase.name);
      continue;
    }
    try {
      await phase.run(ctx);
    } catch (e) {
      result.errors.push(`${phase.name}: ${msg(e)}`);
    }
  }

  result.ms = Date.now() - started;
  try {
    await recordResult(db, { ...result, at: now.toISOString() });
  } catch (e) {
    result.errors.push(`record: ${msg(e)}`);
  }
  return result;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
