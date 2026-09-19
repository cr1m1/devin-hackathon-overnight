import type { StageRole } from "@/lib/db/schema";

// Plan §7.1. Templates are pure data; the tick never switches on a Role.

export type RouteEdge = {
  role: StageRole;
  verdict: "needs-work";
  append: StageRole[];
};

export type FlowTemplate = {
  id: string;
  name: string;
  stages: StageRole[];
  edges: RouteEdge[];
  acceptance: StageRole;
};

export const TEMPLATES = {
  build: {
    id: "build",
    name: "Build",
    stages: ["plan", "implement", "review", "validate"],
    edges: [
      { role: "review", verdict: "needs-work", append: ["amend", "review"] },
      { role: "validate", verdict: "needs-work", append: ["amend", "review", "validate"] },
    ],
    acceptance: "validate",
  },
} as const satisfies Record<string, FlowTemplate>;

export type TemplateId = keyof typeof TEMPLATES;

export function getTemplate(id: string): FlowTemplate {
  const t = (TEMPLATES as Record<string, FlowTemplate>)[id];
  if (!t) throw new Error(`unknown template: ${id}`);
  return t;
}

export function edgeFor(template: FlowTemplate, role: StageRole): RouteEdge | undefined {
  return template.edges.find((e) => e.role === role);
}
