// Plan §5. Server-side only. Devin credentials are read exclusively in lib/devin/ (§15).

const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
};

const list = (name: string, fallback: string): string[] =>
  (process.env[name] ?? fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const env = {
  get cronSecret() {
    return process.env.CRON_SECRET ?? "";
  },
  get repoAllowlist() {
    return list("REPO_ALLOWLIST", "cr1m1/*");
  },
  get repoDenylist() {
    return list("REPO_DENYLIST", "Namadgi/*");
  },
  get maxStagesPerRun() {
    return num("MAX_STAGES_PER_RUN", 16);
  },
  get maxAcuPerRun() {
    return num("MAX_ACU_PER_RUN", 80);
  },
  get deadlineNudgeMin() {
    return num("DEADLINE_NUDGE_MIN", 15);
  },
  get deadlineGraceMin() {
    return num("DEADLINE_GRACE_MIN", 15);
  },
  get tickMaxPolls() {
    return num("TICK_MAX_POLLS", 8);
  },
  get tickMaxStarts() {
    return num("TICK_MAX_STARTS", 3);
  },
  get tickLeaseSec() {
    return num("TICK_LEASE_SEC", 25);
  },
  get demoMode() {
    return process.env.DEMO_MODE === "true";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};
