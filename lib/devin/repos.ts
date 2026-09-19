import type { Connection } from "@/lib/db/schema";
import { clientFor, repoAllowedFor } from "@/lib/connections";

export type RepoOption = { path: string; language: string | null; description: string | null; updated_at: number | null };

/** Repositories this connection's Devin can reach that its lists allow, most recently updated first. */
export async function allowedRepos(c: Connection): Promise<RepoOption[]> {
  const all = await clientFor(c).listRepositories();
  return all
    .filter((r) => repoAllowedFor(c, r.repo_path))
    .map((r) => ({ path: r.repo_path, language: r.repo_language, description: r.repo_description, updated_at: r.last_updated_at }))
    .sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0));
}
