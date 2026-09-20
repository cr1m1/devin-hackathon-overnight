import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDevinClient, DevinApiError, DevinUnknownOutcomeError, verifyCreds } from "@/lib/devin/client";
import { STRUCTURED_OUTPUT_SCHEMA } from "@/lib/flow/schema";
import { sessionTags, sessionTitle } from "@/lib/flow/prompt";
import { FakeDevin } from "./fake-devin/server";

// The fake server as seen through the real client (no database needed).

const creds = { apiKey: "cog_fake_key_for_unit_tests_0000", orgId: "org-unittest0001" };
const fake = new FakeDevin({ ...creds, repos: ["cr1m1/lalafo-stats"] });

const create = (stage: string, repo = "cr1m1/lalafo-stats") => ({
  prompt: "do the thing",
  title: sessionTitle("run_1", "plan"),
  tags: sessionTags("run_1", stage),
  repos: [repo],
  structured_output_schema: STRUCTURED_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
  max_acu_limit: 5,
  resumable: false,
  secret_ids: [],
});

beforeAll(async () => {
  process.env.DEVIN_API_BASE = await fake.start();
});
afterAll(() => fake.stop());

describe("fake Devin v3 server", () => {
  const client = createDevinClient(creds);

  it("lists repositories for verifyCreds and rejects a wrong key", async () => {
    expect(await verifyCreds(creds)).toBe(1);
    await expect(verifyCreds({ ...creds, apiKey: "cog_wrong" })).rejects.toBeInstanceOf(DevinApiError);
  });

  it("scripts a session that finishes with a verdict, found by tag", async () => {
    fake.plan({ kind: "finish-with", verdict: "ok", output: { pull_requests: [{ url: "https://github.com/cr1m1/lalafo-stats/pull/9" }] } });
    const s = await client.startSession(create("stg_a"));
    const got = await client.getSession(s.session_id);
    expect(got.structured_output).toMatchObject({ verdict: "ok" });
    expect(got.pull_requests).toEqual([{ pr_url: "https://github.com/cr1m1/lalafo-stats/pull/9", pr_state: "open" }]);
    expect((await client.findSessionsByTag("stage:stg_a")).map((x) => x.session_id)).toEqual([s.session_id]);
    await client.messageSession(s.session_id, "hurry");
    await client.archiveSession(s.session_id);
    expect(fake.sessions.get(s.session_id)).toMatchObject({ messages: ["hurry"], archived: true });
  });

  it("returns 429 for rate-limit and an unknown outcome for a dropped create", async () => {
    fake.plan({ kind: "rate-limit" }, { kind: "drop-create-response" });
    await expect(client.startSession(create("stg_b"))).rejects.toMatchObject({ isRateLimit: true });
    await expect(client.startSession(create("stg_c"))).rejects.toBeInstanceOf(DevinUnknownOutcomeError);
    expect(fake.byTag("stage:stg_c")).toHaveLength(1); // exists server-side, reconcilable by tag
  });

  it("records violations: non-cr1m1 repo and a second create for one stage", async () => {
    await client.startSession(create("stg_d", "Namadgi/secret"));
    await client.startSession(create("stg_d"));
    expect(fake.violations.some((v) => v.includes("Namadgi/secret"))).toBe(true);
    expect(fake.violations.some((v) => v.includes("second create for stage:stg_d"))).toBe(true);
  });

  it("does not count a retry after a 429 as a second create", async () => {
    fake.plan({ kind: "rate-limit" }, { kind: "stay-working" });
    await expect(client.startSession(create("stg_e"))).rejects.toMatchObject({ isRateLimit: true });
    await client.startSession(create("stg_e"));
    expect(fake.violations.some((v) => v.includes("stage:stg_e"))).toBe(false);
    await client.startSession(create("stg_e"));
    expect(fake.violations.some((v) => v.includes("second create for stage:stg_e"))).toBe(true);
  });
});
