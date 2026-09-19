import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { CreateRunError } from "@/lib/runs/create";

export const json = <T>(body: T, status = 200) => NextResponse.json(body, { status });

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ZodError) return json({ error: "invalid input", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  if (e instanceof CreateRunError) return json({ error: e.message }, e.status);
  console.error(e);
  return json({ error: "internal error" }, 500);
}

export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : (req.headers.get("x-real-ip") ?? null);
}
