import { useEffect, useMemo, useRef } from "react";
import type { ToolLogEntry } from "../lib/toolLog";

type ToolLogPaneProps = {
  sessionId: string;
  entries: ToolLogEntry[];
  connectionState: "connecting" | "connected" | "disconnected";
  onClear: () => void;
};

function formatTimestamp(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString();
  } catch {
    return timestamp;
  }
}

export function ToolLogPane({ sessionId, entries, connectionState, onClear }: ToolLogPaneProps) {
  const count = useMemo(() => entries.length, [entries]);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!logRef.current) {
      return;
    }
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [entries]);

  return (
    <section className="tool-log-shell" aria-label="Tool call log">
      <header className="tool-log-header">
        <div>
          <h2>Tool Log</h2>
          <p>
            Session: <strong>{sessionId}</strong> · {count} entries ·{" "}
            <span className={connectionState}>
              {connectionState === "connected"
                ? "streaming"
                : connectionState === "connecting"
                  ? "connecting"
                  : "disconnected"}
            </span>
          </p>
        </div>
        <button type="button" onClick={onClear}>
          Clear
        </button>
      </header>

      <div className="tool-log-list" role="log" aria-live="polite" ref={logRef}>
        {entries.length === 0 ? (
          <p className="status">No tool calls yet.</p>
        ) : (
          entries.map((entry) => (
            <article key={entry.id} className={`tool-log-entry tool-log-${entry.kind}`}>
              <div className="tool-log-meta">
                <span className="tool-log-kind">{entry.kind === "call" ? "call" : "output"}</span>
                <span className="tool-log-name">{entry.toolName}</span>
                <span className="tool-log-time">{formatTimestamp(entry.timestamp)}</span>
              </div>
              <pre>{entry.text}</pre>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
