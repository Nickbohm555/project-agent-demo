import { afterEach, describe, expect, it, vi } from "vitest";
import { loadGatewayConfig } from "../../../server/gateway/config.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loadGatewayConfig", () => {
  it("defaults to disabled WhatsApp gateway with baileys provider", () => {
    vi.stubEnv("PI_ENABLE_WHATSAPP_GATEWAY", "");
    vi.stubEnv("PI_WHATSAPP_PROVIDER", "");

    const config = loadGatewayConfig("/tmp/project-agent-demo");

    expect(config.whatsapp.enabled).toBe(false);
    expect(config.whatsapp.provider).toBe("baileys");
    expect(config.whatsapp.authDir).toBe("/tmp/project-agent-demo/.whatsapp-auth");
    expect(config.whatsapp.selfChatMode).toBe(false);
  });

  it("parses cloud-api provider and bool toggles", () => {
    vi.stubEnv("PI_ENABLE_WHATSAPP_GATEWAY", "true");
    vi.stubEnv("PI_WHATSAPP_PROVIDER", "cloud-api");
    vi.stubEnv("PI_WHATSAPP_AUTO_START", "false");
    vi.stubEnv("PI_WHATSAPP_PRINT_QR", "false");
    vi.stubEnv("PI_WHATSAPP_AUTH_DIR", "/tmp/custom-auth");
    vi.stubEnv("PI_WHATSAPP_SELF_CHAT_MODE", "true");
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "verify-me");

    const config = loadGatewayConfig("/tmp/project-agent-demo");

    expect(config.whatsapp.enabled).toBe(true);
    expect(config.whatsapp.provider).toBe("cloud-api");
    expect(config.whatsapp.autoStart).toBe(false);
    expect(config.whatsapp.printQr).toBe(false);
    expect(config.whatsapp.authDir).toBe("/tmp/custom-auth");
    expect(config.whatsapp.selfChatMode).toBe(true);
    expect(config.whatsapp.verifyToken).toBe("verify-me");
  });
});
