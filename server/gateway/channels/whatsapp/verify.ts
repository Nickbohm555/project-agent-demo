import { createHmac, timingSafeEqual } from "node:crypto";

type SignatureCheckInput = {
  appSecret: string;
  rawBody: string;
  signatureHeader: string | undefined;
};

export function isWhatsAppSignatureValid(input: SignatureCheckInput): boolean {
  if (!input.signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = createHmac("sha256", input.appSecret).update(input.rawBody).digest("hex");
  const provided = input.signatureHeader.slice("sha256=".length);
  if (expected.length !== provided.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

