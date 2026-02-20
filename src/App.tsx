import { useEffect, useState } from "react";
import { ChatWindow } from "./components/ChatWindow";
import { TerminalPane } from "./components/TerminalPane";
import { ToolLogPane } from "./components/ToolLogPane";
import type { ChatStreamEvent } from "./types/chat";
import { appendToolLog, loadToolLog, mergeToolLogs, saveToolLog, ToolLogEntry } from "./lib/toolLog";

export default function App() {
  const [activeTab, setActiveTab] = useState<"chat" | "terminal" | "tools">("chat");
  const sessionId = "demo-session";
  const agentId = "agent-demo";
  const [toolLogEntries, setToolLogEntries] = useState<ToolLogEntry[]>(() => loadToolLog(sessionId));
  const [toolLogState, setToolLogState] = useState<"connecting" | "connected" | "disconnected">(
    "connecting",
  );

  useEffect(() => {
    const localEntries = loadToolLog(sessionId);
    setToolLogEntries(localEntries);

    let alive = true;
    const fetchLog = () =>
      fetch(`/api/chat/tool-log?sessionId=${encodeURIComponent(sessionId)}`)
        .then(async (res) => {
          if (!res.ok) {
            return [];
          }
          const payload = (await res.json()) as { entries?: ToolLogEntry[] };
          return Array.isArray(payload.entries) ? payload.entries : [];
        })
        .then((serverEntries) => {
          if (!alive || serverEntries.length === 0) {
            return;
          }
          setToolLogEntries((current) => {
            const merged = mergeToolLogs(current, serverEntries);
            saveToolLog(sessionId, merged);
            return merged;
          });
        })
        .catch(() => {
          // ignore fetch errors
        });

    fetchLog();
    const interval = window.setInterval(fetchLog, 2000);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [sessionId]);

  useEffect(() => {
    const eventSource = new EventSource(`/api/chat/stream?sessionId=${encodeURIComponent(sessionId)}`);
    eventSource.onopen = () => setToolLogState("connected");
    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        setToolLogState("disconnected");
      }
    };
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as ChatStreamEvent;
        if (payload.type !== "tool_call" && payload.type !== "tool_output") {
          return;
        }
        const toolName = payload.toolName ?? "unknown";
        const text =
          payload.text && payload.text.trim().length > 0
            ? payload.text
            : payload.type === "tool_call"
              ? "(no args)"
              : "(no output)";
        const entry: ToolLogEntry = {
          id: `${payload.runId}-${payload.type}-${payload.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
          kind: payload.type === "tool_call" ? "call" : "output",
          toolName,
          text,
          timestamp: payload.timestamp,
          runId: payload.runId,
        };
        setToolLogEntries((current) => {
          const next = appendToolLog(current, entry);
          saveToolLog(sessionId, next);
          return next;
        });
      } catch {
        // ignore malformed SSE payload
      }
    };
    return () => eventSource.close();
  }, [sessionId]);

  function clearToolLog() {
    setToolLogEntries([]);
    saveToolLog(sessionId, []);
    fetch(`/api/chat/tool-log?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(
      () => {
        // ignore failures
      },
    );
  }

  return (
    <main className="app-shell">
      <nav className="top-tabs" aria-label="Main view tabs">
        <button
          type="button"
          className={activeTab === "chat" ? "active" : ""}
          onClick={() => setActiveTab("chat")}
        >
          Chat
        </button>
        <button
          type="button"
          className={activeTab === "terminal" ? "active" : ""}
          onClick={() => setActiveTab("terminal")}
        >
          Terminal
        </button>
        <button
          type="button"
          className={activeTab === "tools" ? "active" : ""}
          onClick={() => setActiveTab("tools")}
        >
          Tools
        </button>
      </nav>

      <section className="tab-body">
        {activeTab === "chat" ? (
          <ChatWindow agentId={agentId} sessionId={sessionId} />
        ) : activeTab === "terminal" ? (
          <TerminalPane sessionId={sessionId} />
        ) : (
          <ToolLogPane
            sessionId={sessionId}
            entries={toolLogEntries}
            connectionState={toolLogState}
            onClear={clearToolLog}
          />
        )}
      </section>
    </main>
  );
}
