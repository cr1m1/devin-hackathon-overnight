import type { StageRole } from "@/lib/db/schema";

// One hue per Role (globals.css). Static class strings so Tailwind can see them.
export const ROLE_COLOR: Record<StageRole, { text: string; bg: string; fill: string; border: string; soft: string }> = {
  plan: { text: "text-role-plan", bg: "bg-role-plan", fill: "fill-role-plan", border: "border-role-plan", soft: "bg-role-plan/12" },
  implement: { text: "text-role-implement", bg: "bg-role-implement", fill: "fill-role-implement", border: "border-role-implement", soft: "bg-role-implement/12" },
  review: { text: "text-role-review", bg: "bg-role-review", fill: "fill-role-review", border: "border-role-review", soft: "bg-role-review/12" },
  amend: { text: "text-role-amend", bg: "bg-role-amend", fill: "fill-role-amend", border: "border-role-amend", soft: "bg-role-amend/12" },
  validate: { text: "text-role-validate", bg: "bg-role-validate", fill: "fill-role-validate", border: "border-role-validate", soft: "bg-role-validate/12" },
};
