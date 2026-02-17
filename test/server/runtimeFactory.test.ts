import { describe, expect, it, vi } from "vitest";
import { buildRuntimeContext } from "../../server/agent/runtimeFactory.js";

describe("runtimeFactory", () => {
  it("defaults to embedded runtime", () => {
    const { runtime } = buildRuntimeContext();
    expect(runtime.name).toBe("embedded-pi");
  });

  it("selects mock runtime when env is set", () => {
    vi.stubEnv("AGENT_RUNTIME", "mock");
    const { runtime } = buildRuntimeContext();
    expect(runtime.name).toBe("mock");
    vi.unstubAllEnvs();
  });
});
