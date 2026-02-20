export type ToolLogEntry = {
  id: string;
  kind: "call" | "output";
  toolName: string;
  text: string;
  timestamp: string;
  runId: string;
  sessionId?: string;
};

const MAX_ENTRIES = 200;

function storageKey(sessionId: string): string {
  return `tool-log:${sessionId}`;
}

export function loadToolLog(sessionId: string): ToolLogEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as ToolLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveToolLog(sessionId: string, entries: ToolLogEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(storageKey(sessionId), JSON.stringify(entries));
  } catch {
    // ignore storage failures
  }
}

export function appendToolLog(entries: ToolLogEntry[], next: ToolLogEntry): ToolLogEntry[] {
  const merged = [...entries, next];
  if (merged.length <= MAX_ENTRIES) {
    return merged;
  }
  return merged.slice(merged.length - MAX_ENTRIES);
}

export function mergeToolLogs(current: ToolLogEntry[], incoming: ToolLogEntry[]): ToolLogEntry[] {
  if (incoming.length === 0) {
    return current;
  }
  const map = new Map<string, ToolLogEntry>();
  [...current, ...incoming].forEach((entry) => {
    map.set(entry.id, entry);
  });
  const merged = Array.from(map.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (merged.length <= MAX_ENTRIES) {
    return merged;
  }
  return merged.slice(merged.length - MAX_ENTRIES);
}
