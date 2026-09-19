import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// HTTP driver (ADR-0002): no connection lifecycle on a cold lambda. Atomic groups use db.batch().
function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export const db = drizzle(neon(connectionString()), { schema });
export type Db = typeof db;
