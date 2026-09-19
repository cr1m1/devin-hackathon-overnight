import { describe, expect, it } from "vitest";
import { isRepoAllowed, matchesGlob, REPO_SHAPE } from "@/lib/repos";

const ALLOW = ["cr1m1/*"];
const DENY = ["Namadgi/*"];

describe("matchesGlob", () => {
  it("matches owner/* case-insensitively", () => {
    expect(matchesGlob("cr1m1/lalafo-stats", "cr1m1/*")).toBe(true);
    expect(matchesGlob("CR1M1/lalafo-stats", "cr1m1/*")).toBe(true);
    expect(matchesGlob("cr1m1/", "cr1m1/*")).toBe(false);
  });
  it("matches exact owner/name only when identical", () => {
    expect(matchesGlob("cr1m1/notifanga", "cr1m1/notifanga")).toBe(true);
    expect(matchesGlob("cr1m1/notifanga2", "cr1m1/notifanga")).toBe(false);
  });
  it("does not treat a prefix owner as a match", () => {
    expect(matchesGlob("cr1m1x/repo", "cr1m1/*")).toBe(false);
  });
});

describe("isRepoAllowed (AGENTS.md hard rule)", () => {
  it("allows cr1m1 repos", () => {
    for (const r of ["cr1m1/lalafo-stats", "cr1m1/karyz-depter", "cr1m1/notifanga"]) expect(isRepoAllowed(r, ALLOW, DENY)).toBe(true);
  });
  it("refuses every Namadgi repo, even if allowlisted", () => {
    expect(isRepoAllowed("Namadgi/33International", ALLOW, DENY)).toBe(false);
    expect(isRepoAllowed("namadgi/anything", ALLOW, DENY)).toBe(false);
    expect(isRepoAllowed("Namadgi/x", ["*/*", "Namadgi/*"], DENY)).toBe(false);
  });
  it("refuses owners that are simply not allowlisted", () => {
    expect(isRepoAllowed("fliq-sh/core-api", ALLOW, DENY)).toBe(false);
    expect(isRepoAllowed("Red-Force-KG/RosterEzy", ALLOW, DENY)).toBe(false);
  });
  it("refuses malformed shapes before consulting the lists", () => {
    for (const r of ["cr1m1", "cr1m1/a/b", "", "cr1m1/a b", "https://github.com/cr1m1/x"]) {
      expect(REPO_SHAPE.test(r)).toBe(false);
      expect(isRepoAllowed(r, ALLOW, DENY)).toBe(false);
    }
  });
});

describe("wildcard for bring-your-own connections", () => {
  it("*/* allows any well-formed repo, deny list still wins", () => {
    expect(isRepoAllowed("someone/anything", ["*/*"], [])).toBe(true);
    expect(isRepoAllowed("someone/anything", ["*/*"], ["someone/*"])).toBe(false);
    expect(isRepoAllowed("not-a-repo", ["*/*"], [])).toBe(false);
  });
});
