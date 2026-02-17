import { describe, expect, it, vi } from "vitest";
import { buildRuntime } from "../../server/agent/runtimeFactory.js";

describe("runtimeFactory", () => {
  it("defaults to mock runtime", () => {
    const runtime = buildRuntime();
    expect(runtime.name).toBe("mock");
  });

  it("selects embedded runtime when env is set", () => {
    vi.stubEnv("AGENT_RUNTIME", "embedded-pi");
    const runtime = buildRuntime();
    expect(runtime.name).toBe("embedded-pi");
    vi.unstubAllEnvs();
  });
});
