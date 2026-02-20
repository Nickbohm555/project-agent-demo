import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isWhatsAppSignatureValid } from "../../../server/gateway/channels/whatsapp/verify.js";

describe("isWhatsAppSignatureValid", () => {
  it("validates matching signature headers", () => {
    const appSecret = "top-secret";
    const rawBody = JSON.stringify({ hello: "world" });
    const digest = createHmac("sha256", appSecret).update(rawBody).digest("hex");

    expect(
      isWhatsAppSignatureValid({
        appSecret,
        rawBody,
        signatureHeader: `sha256=${digest}`,
      }),
    ).toBe(true);
  });

  it("rejects invalid signatures", () => {
    expect(
      isWhatsAppSignatureValid({
        appSecret: "top-secret",
        rawBody: "{}",
        signatureHeader: "sha256=not-valid",
      }),
    ).toBe(false);
  });
});

