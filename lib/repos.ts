// Plan §12.0 / §15. A repository may be targeted only if it matches the connection's allowlist
// and does not match its denylist. Globs: "*/*", "owner/*" or exact "owner/name", case-insensitive.

export const REPO_SHAPE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function matchesGlob(repo: string, glob: string): boolean {
  const r = repo.toLowerCase();
  const g = glob.trim().toLowerCase();
  if (!g) return false;
  if (g === "*/*" || g === "*") return REPO_SHAPE.test(repo);
  if (g.endsWith("/*")) {
    const owner = g.slice(0, -2);
    return r.startsWith(owner + "/") && r.length > owner.length + 1;
  }
  return r === g;
}

export function isRepoAllowed(repo: string, allow: readonly string[], deny: readonly string[]): boolean {
  if (!REPO_SHAPE.test(repo)) return false;
  if (deny.some((g) => matchesGlob(repo, g))) return false;
  return allow.some((g) => matchesGlob(repo, g));
}
