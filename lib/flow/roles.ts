import type { StageRole } from "@/lib/db/schema";

// Plan §7.2 / §8.1. v1 constants; recalibrate from observed acus_consumed after the first real Run.

export type RoleDef = {
  role: StageRole;
  title: string;
  estimateMinutes: number;
  acuLimit: number;
  opensPr: boolean;
  instruction: string;
};

export const ROLES: Record<StageRole, RoleDef> = {
  plan: {
    role: "plan",
    title: "Plan",
    estimateMinutes: 30,
    acuLimit: 8,
    opensPr: false,
    instruction:
      "Read the repository and the goal (fetch the referenced ticket if there is one). Locate or reproduce the problem. Produce a file-level plan a fresh session can execute without guessing. Decide whether the work should be one pull request or an ordered stack of small pull requests. Write the acceptance criteria. Do not modify code. Return needs-work only if the goal is not actionable as stated.",
  },
  implement: {
    role: "implement",
    title: "Implement",
    estimateMinutes: 90,
    acuLimit: 25,
    opensPr: true,
    instruction:
      "Execute the plan. Write tests for the behaviour you change. Open the pull request(s) as the plan specifies. Return ok when they are open and tests pass locally; blocked if you cannot proceed.",
  },
  review: {
    role: "review",
    title: "Review",
    estimateMinutes: 30,
    acuLimit: 8,
    opensPr: false,
    instruction:
      "Review the diff of every open pull request as a critic who did not write it: correctness, edge cases, whether the acceptance criteria are actually met. Return needs-work with a specific, enumerated list of problems, or ok if there are none.",
  },
  amend: {
    role: "amend",
    title: "Amend",
    estimateMinutes: 45,
    acuLimit: 15,
    opensPr: true,
    instruction:
      "Address every problem listed by the latest review, and only those. Add a regression test per fix. Update the existing pull request(s); do not open new ones unless the plan's split requires it.",
  },
  validate: {
    role: "validate",
    title: "Validate",
    estimateMinutes: 30,
    acuLimit: 10,
    opensPr: false,
    instruction:
      "Independently verify each acceptance criterion against the real branch: run the test suite and the scenario in the goal. Report PASS or FAIL per criterion with evidence. Return complete only if all pass; otherwise needs-work (fixable) or blocked (needs a human).",
  },
};

export function playbookIdFor(role: StageRole): string | undefined {
  return process.env[`PLAYBOOK_ID_${role.toUpperCase()}`] || undefined;
}
