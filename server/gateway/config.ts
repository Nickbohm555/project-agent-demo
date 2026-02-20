import path from "node:path";

export type WhatsAppGatewayProvider = "baileys" | "cloud-api";

export type GatewayConfig = {
  whatsapp: {
    enabled: boolean;
    provider: WhatsAppGatewayProvider;
    autoStart: boolean;
    authDir: string;
    printQr: boolean;
    selfChatMode: boolean;
    verifyToken: string | null;
    webhookValidateSignature: boolean;
  };
};

function envFlag(value: string | undefined, defaultValue = false): boolean {
  if (!value) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseProvider(value: string | undefined): WhatsAppGatewayProvider {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "cloud-api") {
    return "cloud-api";
  }
  return "baileys";
}

export function loadGatewayConfig(cwd: string = process.cwd()): GatewayConfig {
  const enabled = envFlag(process.env.PI_ENABLE_WHATSAPP_GATEWAY, false);
  const provider = parseProvider(process.env.PI_WHATSAPP_PROVIDER);

  return {
    whatsapp: {
      enabled,
      provider,
      autoStart: envFlag(process.env.PI_WHATSAPP_AUTO_START, true),
      authDir: process.env.PI_WHATSAPP_AUTH_DIR?.trim() || path.join(cwd, ".whatsapp-auth"),
      printQr: envFlag(process.env.PI_WHATSAPP_PRINT_QR, true),
      selfChatMode: envFlag(process.env.PI_WHATSAPP_SELF_CHAT_MODE, false),
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN?.trim() || null,
      webhookValidateSignature: envFlag(process.env.WHATSAPP_WEBHOOK_VALIDATE_SIGNATURE, true),
    },
  };
}
