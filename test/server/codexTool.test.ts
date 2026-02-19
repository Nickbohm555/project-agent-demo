import { describe, expect, it, vi } from "vitest";
import { createCodexTool } from "../../server/agent/codexTool.js";

describe("codexTool", () => {
  it("starts and reports status", async () => {
    const store = {
      start: vi.fn(() => ({ started: true, running: true, threadId: "t1", cwd: "/Users/nickbohm/Desktop/Projects", pid: 101 })),
      status: vi.fn(() => ({ running: true, threadId: "t1", pid: 101 })),
      stop: vi.fn(() => ({ stopped: true, running: false, threadId: "t1" })),
      continue: vi.fn(),
    };

    const tool = createCodexTool({
      defaultCwd: "/Users/nickbohm/Desktop/Projects",
      threadId: "t1",
      sessionStore: store as any,
    });

    const start = await tool.execute("c1", { action: "start" } as any);
    const status = await tool.execute("c2", { action: "status" } as any);

    expect(start.content[0]?.type).toBe("text");
    expect(String((start.content[0] as any)?.text || "")).toContain("Started Codex session");
    expect(String((status.content[0] as any)?.text || "")).toContain("running");
  });

  it("continues existing session and streams output", async () => {
    const continueMock = vi.fn(async (_threadId, _cwd, params) => {
      params.onChunk?.("chunk-a");
      params.onChunk?.("chunk-b");
      return { output: "final output" };
    });

    const store = {
      start: vi.fn(),
      status: vi.fn(),
      stop: vi.fn(),
      continue: continueMock,
    };

    const updates: string[] = [];
    const tool = createCodexTool({
      defaultCwd: "/Users/nickbohm/Desktop/Projects",
      threadId: "thread-x",
      sessionStore: store as any,
    });

    const result = await tool.execute(
      "c3",
      { action: "continue", prompt: "do thing" } as any,
      undefined,
      (partial) => {
        const text = (partial.content[0] as any)?.text;
        if (typeof text === "string") {
          updates.push(text);
        }
      },
    );

    expect(continueMock).toHaveBeenCalledOnce();
    expect(updates).toEqual(["chunk-a", "chunk-b"]);
    expect(String((result.content[0] as any)?.text || "")).toContain("final output");
  });

  it("returns a non-throwing failure message when codex start fails", async () => {
    const store = {
      start: vi.fn(() => ({
        started: false,
        running: false,
        threadId: "t1",
        cwd: "/tmp/missing",
        error: "spawn failed",
      })),
      status: vi.fn(),
      stop: vi.fn(),
      continue: vi.fn(),
    };

    const tool = createCodexTool({
      defaultCwd: "/tmp/missing",
      threadId: "t1",
      sessionStore: store as any,
    });

    const start = await tool.execute("c4", { action: "start" } as any);
    expect(String((start.content[0] as any)?.text || "")).toContain("Failed to start Codex session");
    expect(String((start.content[0] as any)?.text || "")).toContain("spawn failed");
  });

  it("returns failure content instead of throwing when continue fails", async () => {
    const store = {
      start: vi.fn(),
      status: vi.fn(),
      stop: vi.fn(),
      continue: vi.fn(async () => {
        throw new Error("exitCode=127\nRecent output:\ncommand not found");
      }),
    };

    const tool = createCodexTool({
      defaultCwd: "/tmp/demo",
      threadId: "t2",
      sessionStore: store as any,
    });

    const result = await tool.execute("c5", { action: "continue", prompt: "run codex" } as any);
    expect(String((result.content[0] as any)?.text || "")).toContain("Codex continue failed");
    expect(String((result.content[0] as any)?.text || "")).toContain("exitCode=127");
  });
});
