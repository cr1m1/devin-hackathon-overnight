import { z } from "zod";
import { VERDICTS } from "@/lib/db/schema";

// Plan §8.2. One schema for every Role. Sent verbatim as structured_output_schema and mirrored in zod.

export const STRUCTURED_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "report_md"],
  properties: {
    verdict: { type: "string", enum: ["ok", "needs-work", "blocked", "complete"] },
    summary: { type: "string", maxLength: 1200 },
    report_md: { type: "string", maxLength: 20000 },
    handoff: { type: "string", maxLength: 600 },
    pull_requests: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        required: ["url"],
        additionalProperties: false,
        properties: { url: { type: "string" }, title: { type: "string", maxLength: 200 } },
      },
    },
    acceptance_criteria: { type: "array", maxItems: 8, items: { type: "string", maxLength: 200 } },
    split: { type: "array", maxItems: 6, items: { type: "string", maxLength: 200 } },
  },
} as const;

const trimmed = (max: number) => z.string().transform((s) => s.trim().slice(0, max));

export const stageOutput = z
  .object({
    verdict: z.enum(VERDICTS),
    summary: trimmed(1200),
    report_md: trimmed(20000),
    handoff: trimmed(600).optional(),
    pull_requests: z
      .array(z.object({ url: z.string().url(), title: z.string().max(200).optional() }).passthrough())
      .max(10)
      .optional(),
    acceptance_criteria: z.array(trimmed(200)).max(8).optional(),
    split: z.array(trimmed(200)).max(6).optional(),
  })
  .passthrough();

export type StageOutput = z.infer<typeof stageOutput>;

/** Returns the parsed output, or null when it is absent or invalid. Never throws. */
export function parseStageOutput(raw: unknown): StageOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = stageOutput.safeParse(raw);
  return r.success ? r.data : null;
}
