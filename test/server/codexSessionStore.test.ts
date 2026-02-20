import { describe, expect, it } from "vitest";
import { __testing__ } from "../../server/agent/codexSessionStore.js";

describe("codexSessionStore env logging helpers", () => {
  it("masks tokens and reports missing env", () => {
    expect(__testing__.formatEnvValue("")).toBe("missing");
    expect(__testing__.formatEnvValue(undefined)).toBe("missing");
    expect(__testing__.formatEnvValue("short")).toBe("***");
    expect(__testing__.maskToken("sk-test-1234567890")).toBe("sk-tes...7890");
  });
});

describe("codexSessionStore env helpers", () => {
  it("ensures standard PATH entries are present", () => {
    const env = { PATH: "" };
    const nextEnv = __testing__.buildCodexEnv(env);
    expect(nextEnv.PATH).toContain("/usr/bin");
    expect(nextEnv.PATH).toContain("/bin");
  });

  it("preserves existing PATH entries while prepending defaults", () => {
    const env = { PATH: "/custom/bin:/usr/bin" };
    const nextEnv = __testing__.buildCodexEnv(env);
    expect(nextEnv.PATH?.startsWith("/usr/local/bin")).toBe(true);
    expect(nextEnv.PATH).toContain("/custom/bin");
  });
});

describe("codexSessionStore git hint helper", () => {
  it("returns none when no candidates exist", () => {
    const hint = __testing__.buildGitHint(["/a", "/b"], () => false);
    expect(hint).toBe("none");
  });

  it("joins candidates that exist", () => {
    const hint = __testing__.buildGitHint(["/a", "/b", "/c"], (path) => path === "/b" || path === "/c");
    expect(hint).toBe("/b,/c");
  });
});
