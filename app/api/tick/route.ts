import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { json } from "@/lib/http";
import { runTick } from "@/lib/tick/tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorized(req: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return !env.isProduction; // local dev without a secret is fine; production requires one
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("key") === secret;
}

// Always 200 with a JSON body once authorized (§10): a 500 makes the cron log useless.
export async function GET(req: Request) {
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);
  const result = await runTick(db);
  return json(result);
}
