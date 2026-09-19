import { getHealthCached } from "@/lib/health";
import { env } from "@/lib/env";

// Server component: renders the app-wide red banner (§13.4) and the demo notice (§15).
export async function HealthBanner() {
  let problems: string[] = [];
  try {
    const h = await getHealthCached();
    if (h.db === "error") problems.push("The database is unreachable.");
    if (h.encryption === "missing") problems.push("Credential storage is not configured (ENCRYPTION_KEY).");
    if (h.db === "ok" && h.tick_stale)
      problems.push(h.last_tick_at ? `The scheduler has not run since ${new Date(h.last_tick_at).toLocaleTimeString()}.` : "The scheduler has never run — check the cron job.");
  } catch {
    problems = ["Health check failed."];
  }

  return (
    <>
      {problems.length > 0 && (
        <div className="bg-bad text-white text-sm">
          <div className="max-w-[720px] mx-auto px-5 py-2">
            <span className="font-medium">This instance is not healthy.</span> {problems.join(" ")}
          </div>
        </div>
      )}
      {env.demoMode && (
        <div className="bg-warn-bg text-warn text-sm border-b border-rule">
          <div className="max-w-[720px] mx-auto px-5 py-2">Public demo. Runs here are visible to anyone; do not paste credentials into a goal.</div>
        </div>
      )}
    </>
  );
}
