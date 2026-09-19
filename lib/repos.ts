import { env } from "./env";

// Plan §12.0 / §15 / AGENTS.md. A repository may be targeted only if it matches the allowlist
// and does not match the denylist. Globs are `owner/*` or exact `owner/name`, case-insensitive.

export const REPO_SHAPE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function matchesGlob(repo: string, glob: string): boolean {
  const r = repo.toLowerCase();
  const g = glob.trim().toLowerCase();
  if (!g) return false;
  if (g.endsWith("/*")) {
    const owner = g.slice(0, -2);
    return r.startsWith(owner + "/") && r.length > owner.length + 1;
  }
  return r === g;
}

export function isRepoAllowed(repo: string, allow: readonly string[] = env.repoAllowlist, deny: readonly string[] = env.repoDenylist): boolean {
  if (!REPO_SHAPE.test(repo)) return false;
  if (deny.some((g) => matchesGlob(repo, g))) return false;
  return allow.some((g) => matchesGlob(repo, g));
}

export function repoRefusalReason(repo: string): string | null {
  if (!REPO_SHAPE.test(repo)) return "repository must look like owner/name";
  if (env.repoDenylist.some((g) => matchesGlob(repo, g))) return `repository ${repo} is on the deny list`;
  if (!env.repoAllowlist.some((g) => matchesGlob(repo, g))) return `repository ${repo} is not on the allow list`;
  return null;
}
