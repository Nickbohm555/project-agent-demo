import { describe, expect, it, vi } from "vitest";
import {
  getConfiguredToolNames,
  getToolCatalog,
  resolveAgentToolConfig,
} from "../../server/agent/toolConfig.js";

describe("resolveAgentToolConfig", () => {
  it("defaults with codex tool enabled and cli tool disabled", () => {
    vi.stubEnv("PI_ENABLE_CODEX_TOOL", "");
    vi.stubEnv("PI_CODEX_WORKDIR", "");

    const cfg = resolveAgentToolConfig("/tmp/demo");

    expect(cfg.codexToolEnabled).toBe(true);
    expect(cfg.codexWorkdir).toBe("/tmp/demo");
    expect(cfg.codexBridgeUrl).toBeNull();

    vi.unstubAllEnvs();
  });

  it("parses codex settings from env", () => {
    vi.stubEnv("PI_ENABLE_CODEX_TOOL", "false");
    vi.stubEnv("PI_ENABLE_CODEX_BRIDGE", "true");
    vi.stubEnv("PI_CODEX_WORKDIR", "/tmp/codex");
    vi.stubEnv("PI_CODEX_BRIDGE_URL", "http://127.0.0.1:43319");

    const cfg = resolveAgentToolConfig("/tmp/demo");

    expect(cfg.codexToolEnabled).toBe(false);
    expect(cfg.codexWorkdir).toBe("/tmp/codex");
    expect(cfg.codexBridgeUrl).toBe("http://127.0.0.1:43319");

    vi.unstubAllEnvs();
  });

  it("lists configured tools in deterministic order", () => {
    expect(
      getConfiguredToolNames({
        codexToolEnabled: true,
        codexWorkdir: "/tmp/demo",
        codexBridgeUrl: null,
      }),
    ).toEqual(["codex"]);
  });

  it("returns complete tool catalog with enabled flags", () => {
    expect(
      getToolCatalog({
        codexToolEnabled: true,
        codexWorkdir: "/tmp/demo",
        codexBridgeUrl: null,
      }),
    ).toEqual([
      { name: "codex", kind: "custom", enabled: true },
    ]);
  });
});
