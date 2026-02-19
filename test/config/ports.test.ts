import { describe, expect, it } from "vitest";
import { resolveApiPort, resolveProxyApiPort, resolveWebHost, resolveWebPort } from "../../config/ports.js";

describe("port resolution", () => {
  it("uses project defaults in development", () => {
    const env = { NODE_ENV: "development", PORT: "9000" } as NodeJS.ProcessEnv;
    expect(resolveApiPort(env)).toBe(43217);
    expect(resolveProxyApiPort(env)).toBe(43217);
    expect(resolveWebPort(env)).toBe(43218);
    expect(resolveWebHost(env)).toBe("127.0.0.1");
  });

  it("respects explicit PAD ports", () => {
    const env = {
      PAD_API_PORT: "5001",
      PAD_WEB_PORT: "5002",
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv;

    expect(resolveApiPort(env)).toBe(5001);
    expect(resolveProxyApiPort(env)).toBe(5001);
    expect(resolveWebPort(env)).toBe(5002);
  });

  it("uses explicit PAD web host when provided", () => {
    const env = { PAD_WEB_HOST: "0.0.0.0" } as NodeJS.ProcessEnv;
    expect(resolveWebHost(env)).toBe("0.0.0.0");
  });

  it("allows generic PORT fallback only in production server mode", () => {
    const env = { NODE_ENV: "production", PORT: "8080" } as NodeJS.ProcessEnv;
    expect(resolveApiPort(env)).toBe(8080);
    expect(resolveProxyApiPort(env)).toBe(43217);
  });
});
