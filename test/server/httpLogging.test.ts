import { describe, expect, it } from "vitest";
import { __testing__ } from "../../server/agent/httpLogging.js";

describe("httpLogging", () => {
  it("masks authorization header tokens", () => {
    expect(__testing__.maskAuthorizationHeader("Bearer sk-test-1234567890")).toBe("Bearer sk-tes...7890");
    expect(__testing__.maskAuthorizationHeader("Basic abcdef")).toBe("Basic ***");
  });

  it("finds headers across init and request", () => {
    const headers = new Headers({ Authorization: "Bearer sk-test" });
    expect(__testing__.pickHeaderValue(new Request("https://api.openai.com", { headers }), {}, "authorization")).toBe(
      "Bearer sk-test",
    );
    expect(__testing__.pickHeaderValue("https://api.openai.com", { headers }, "authorization")).toBe(
      "Bearer sk-test",
    );
  });

  it("detects openai hosts", () => {
    expect(__testing__.shouldLogUrl("https://api.openai.com/v1", ["openai.com"])).toBe(true);
    expect(__testing__.shouldLogUrl("https://example.com", ["openai.com"])).toBe(false);
  });
});
