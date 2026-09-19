import { listRepositories } from "./client";
import { isRepoAllowed } from "@/lib/repos";

export type RepoOption = { path: string; language: string | null; description: string | null; updated_at: number | null };

/** Repositories Devin can reach that this app is allowed to target (§12.0), most recently updated first. */
export async function allowedRepos(): Promise<RepoOption[]> {
  const all = await listRepositories();
  return all
    .filter((r) => isRepoAllowed(r.repo_path))
    .map((r) => ({ path: r.repo_path, language: r.repo_language, description: r.repo_description, updated_at: r.last_updated_at }))
    .sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0));
}
