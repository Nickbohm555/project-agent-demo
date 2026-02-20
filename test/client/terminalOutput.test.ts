import { describe, expect, it } from "vitest";
import { mergeCodexOutput } from "../../src/components/terminal/terminalOutput";

describe("mergeCodexOutput", () => {
  it("returns empty when both inputs are blank", () => {
    expect(mergeCodexOutput("", "")).toEqual([]);
  });

  it("returns only stream output when text duplicates stream", () => {
    expect(mergeCodexOutput("hello", "hello")).toEqual(["hello"]);
  });

  it("returns stream then text when different", () => {
    expect(mergeCodexOutput("stream", "final")).toEqual(["stream", "final"]);
  });

  it("returns whichever output is present", () => {
    expect(mergeCodexOutput("", "final")).toEqual(["final"]);
    expect(mergeCodexOutput("stream", "")).toEqual(["stream"]);
  });
});
