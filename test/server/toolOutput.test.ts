import { describe, expect, it } from "vitest";
import { getToolOutputText } from "../../server/agent/toolOutput.js";

describe("getToolOutputText", () => {
  it("extracts text from tool_execution_update partial result", () => {
    const event = {
      type: "tool_execution_update",
      partialResult: {
        content: [
          { type: "text", text: "hello " },
          { type: "text", text: "world" },
        ],
      },
    };

    expect(getToolOutputText(event as never)).toBe("hello world");
  });

  it("extracts text from tool_execution_end result", () => {
    const event = {
      type: "tool_execution_end",
      result: {
        content: [{ type: "text", text: "done" }],
      },
    };

    expect(getToolOutputText(event as never)).toBe("done");
  });

  it("returns undefined when there is no text content", () => {
    const event = {
      type: "tool_execution_end",
      result: { content: [{ type: "image", text: "ignored" }] },
    };

    expect(getToolOutputText(event as never)).toBeUndefined();
  });
});
