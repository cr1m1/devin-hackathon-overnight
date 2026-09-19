import { describe, expect, it } from "vitest";
import { parseStageOutput, STRUCTURED_OUTPUT_SCHEMA } from "@/lib/flow/schema";

const good = { verdict: "ok", summary: "Did the thing.", report_md: "# Report\nDone." };

describe("parseStageOutput", () => {
  it("accepts the minimal valid output", () => {
    expect(parseStageOutput(good)?.verdict).toBe("ok");
  });
  it("rejects null, non-objects, missing verdict, unknown verdict", () => {
    expect(parseStageOutput(null)).toBeNull();
    expect(parseStageOutput("ok")).toBeNull();
    expect(parseStageOutput({ summary: "x", report_md: "y" })).toBeNull();
    expect(parseStageOutput({ ...good, verdict: "done" })).toBeNull();
  });
  it("truncates over-long strings instead of failing", () => {
    const out = parseStageOutput({ ...good, summary: "x".repeat(5000) });
    expect(out?.summary.length).toBe(1200);
  });
  it("keeps pull requests, criteria and split when present", () => {
    const out = parseStageOutput({
      ...good,
      pull_requests: [{ url: "https://github.com/cr1m1/lalafo-stats/pull/7", title: "Fix range" }],
      acceptance_criteria: ["last day included", "tests pass"],
      split: ["schema", "api"],
    });
    expect(out?.pull_requests?.[0].url).toContain("/pull/7");
    expect(out?.acceptance_criteria).toHaveLength(2);
    expect(out?.split).toEqual(["schema", "api"]);
  });
  it("rejects a pull request without a valid url", () => {
    expect(parseStageOutput({ ...good, pull_requests: [{ url: "not a url" }] })).toBeNull();
  });
  it("tolerates a partially filled object with the wrong shape by returning null (malformed-output row)", () => {
    expect(parseStageOutput({ verdict: "ok" })).toBeNull();
  });
  it("JSON schema and zod agree on the verdict vocabulary", () => {
    expect(STRUCTURED_OUTPUT_SCHEMA.properties.verdict.enum).toEqual(["ok", "needs-work", "blocked", "complete"]);
  });
});
