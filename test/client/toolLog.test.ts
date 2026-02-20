import { describe, expect, it } from "vitest";
import { appendToolLog, mergeToolLogs } from "../../src/lib/toolLog";

describe("appendToolLog", () => {
  it("appends entries in order", () => {
    const initial = [];
    const next = {
      id: "1",
      kind: "call",
      toolName: "codex",
      text: "hello",
      timestamp: "2020-01-01T00:00:00.000Z",
      runId: "r1",
    };
    expect(appendToolLog(initial, next)).toEqual([next]);
  });

  it("caps log size to 200 entries", () => {
    const entries = Array.from({ length: 200 }, (_, i) => ({
      id: `id-${i}`,
      kind: "output" as const,
      toolName: "codex",
      text: String(i),
      timestamp: "2020-01-01T00:00:00.000Z",
      runId: "r1",
    }));
    const appended = appendToolLog(entries, {
      id: "id-200",
      kind: "output",
      toolName: "codex",
      text: "200",
      timestamp: "2020-01-01T00:00:00.000Z",
      runId: "r1",
    });
    expect(appended).toHaveLength(200);
    expect(appended[0]?.id).toBe("id-1");
    expect(appended[appended.length - 1]?.id).toBe("id-200");
  });

  it("merges logs by id and keeps order", () => {
    const current = [
      {
        id: "a",
        kind: "call" as const,
        toolName: "codex",
        text: "a",
        timestamp: "2020-01-01T00:00:00.000Z",
        runId: "r1",
      },
    ];
    const incoming = [
      {
        id: "b",
        kind: "output" as const,
        toolName: "codex",
        text: "b",
        timestamp: "2020-01-01T00:00:01.000Z",
        runId: "r1",
      },
      {
        id: "a",
        kind: "call" as const,
        toolName: "codex",
        text: "a",
        timestamp: "2020-01-01T00:00:00.000Z",
        runId: "r1",
      },
    ];
    const merged = mergeToolLogs(current, incoming);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.id).toBe("a");
    expect(merged[1]?.id).toBe("b");
  });
});
