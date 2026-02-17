import { describe, expect, it, vi } from "vitest";
import { resolveAgentToolConfig } from "../../server/agent/toolConfig.js";

describe("resolveAgentToolConfig", () => {
  it("defaults to cli tool disabled", () => {
    vi.stubEnv("PI_ENABLE_CLI_TOOL", "");
    vi.stubEnv("PI_CLI_ALLOWED_PREFIXES", "");

    const cfg = resolveAgentToolConfig("/tmp/demo");

    expect(cfg.cliToolEnabled).toBe(false);
    expect(cfg.cliWorkdir).toBe("/tmp/demo");
    expect(cfg.cliAllowedPrefixes).toEqual([]);

    vi.unstubAllEnvs();
  });

  it("parses cli tool settings from env", () => {
    vi.stubEnv("PI_ENABLE_CLI_TOOL", "true");
    vi.stubEnv("PI_CLI_WORKDIR", "/tmp/work");
    vi.stubEnv("PI_CLI_TIMEOUT_SECONDS", "30");
    vi.stubEnv("PI_CLI_ALLOWED_PREFIXES", "pwd, ls, npm run");

    const cfg = resolveAgentToolConfig("/tmp/demo");

    expect(cfg.cliToolEnabled).toBe(true);
    expect(cfg.cliWorkdir).toBe("/tmp/work");
    expect(cfg.cliTimeoutSeconds).toBe(30);
    expect(cfg.cliAllowedPrefixes).toEqual(["pwd", "ls", "npm run"]);

    vi.unstubAllEnvs();
  });
});
