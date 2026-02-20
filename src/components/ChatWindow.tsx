import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { fetchHistory, fetchRuntimeInfo, sendMessage } from "../lib/api";
import type { AgentRuntimeInfo, ChatMessage, ChatStreamEvent } from "../types/chat";

type ChatWindowProps = {
  agentId: string;
  sessionId: string;
};

export function ChatWindow({ agentId, sessionId }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveAssistant, setLiveAssistant] = useState("");
  const [liveTool, setLiveTool] = useState("");
  const [liveToolName, setLiveToolName] = useState<string | null>(null);
  const [liveToolArgs, setLiveToolArgs] = useState<string | null>(null);
  const [runPhase, setRunPhase] = useState<"idle" | "running" | "error" | "done">("idle");
  const [toolCatalog, setToolCatalog] = useState<NonNullable<AgentRuntimeInfo["toolCatalog"]>>([]);
  const logRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    setLoading(true);

    const load = () => {
      fetchHistory(sessionId)
        .then((session) => {
          if (cancelled) {
            return;
          }
          setMessages(session.messages);
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          attempts += 1;
          if (attempts < 5) {
            window.setTimeout(load, 500);
            return;
          }
          setLoading(false);
        });
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;

    fetchRuntimeInfo()
      .then((runtime) => {
        if (cancelled) {
          return;
        }
        const fullCatalog = Array.isArray(runtime.toolCatalog) ? runtime.toolCatalog : [];
        if (fullCatalog.length > 0) {
          setToolCatalog(fullCatalog);
          return;
        }

        const fallbackCatalog: NonNullable<AgentRuntimeInfo["toolCatalog"]> = [];
        if (runtime.toolConfig?.codexToolEnabled) {
          fallbackCatalog.push({ name: "codex", kind: "custom", enabled: true });
        }
        setToolCatalog(fallbackCatalog);
      })
      .catch(() => {
        if (!cancelled) {
          setToolCatalog([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const eventSource = new EventSource(`/api/chat/stream?sessionId=${encodeURIComponent(sessionId)}`);
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as ChatStreamEvent;
        if (payload.type === "lifecycle" && payload.phase === "start") {
          setLiveAssistant("");
          setLiveTool("");
          setLiveToolName(null);
          setLiveToolArgs(null);
          setRunPhase("running");
          return;
        }
        if (payload.type === "lifecycle" && (payload.phase === "end" || payload.phase === "error")) {
          setRunPhase(payload.phase === "error" ? "error" : "done");
          return;
        }
        if (payload.type === "assistant_delta" && payload.text) {
          setLiveAssistant(payload.text);
          return;
        }
        if (payload.type === "tool_call") {
          setLiveToolName(payload.toolName ?? null);
          setLiveToolArgs(payload.text ?? null);
          setRunPhase("running");
          return;
        }
        if (payload.type === "tool_output" && payload.text) {
          setLiveTool((current) => `${current}${payload.text}`.slice(-12_000));
          setLiveToolName((current) => payload.toolName ?? current);
          setRunPhase("running");
        }
      } catch {
        // ignore malformed SSE payload
      }
    };
    eventSource.onerror = () => {
      // browser auto-reconnects for EventSource
    };
    return () => eventSource.close();
  }, [sessionId]);

  useEffect(() => {
    if (!logRef.current) {
      return;
    }
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, liveAssistant, liveTool]);

  const canSend = useMemo(() => draft.trim().length > 0 && !sending, [draft, sending]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) {
      return;
    }

    const text = draft.trim();
    setDraft("");
    setSending(true);
    setError(null);

    const optimisticUser: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      text,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, optimisticUser]);

    try {
      const result = await sendMessage({ agentId, sessionId, message: text });
      setMessages(result.session.messages);
    } catch (err) {
      setError(String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="chat-shell">
      <header className="chat-header">
        <div>
          <h1>Project Agent Demo</h1>
          <p>
            OpenClaw-style data flow: UI → API → Service → Embedded Runtime
            <br />
            Agent: <strong>{agentId}</strong>
          </p>
        </div>
        <aside className="tool-badge-panel" aria-label="Available tools">
          <span className="tool-badge-label">Available tools</span>
          {toolCatalog.length > 0 ? (
            <ul className="tool-badge-list">
              {toolCatalog.map((tool) => (
                <li key={tool.name} className={tool.enabled ? "tool-enabled" : "tool-disabled"}>
                  {tool.name} ({tool.kind}) {tool.enabled ? "on" : "off"}
                </li>
              ))}
            </ul>
          ) : (
            <span className="tool-badge-list-empty">none</span>
          )}
        </aside>
      </header>

      <section className="chat-log" aria-live="polite" ref={logRef}>
        {loading ? <p className="status">Loading chat...</p> : null}
        {messages.length === 0 ? <p className="status">No messages yet.</p> : null}

        {runPhase === "running" || liveTool ? (
          <article className="live-panel">
            <span className="role">
              tool stream{liveToolName ? ` (${liveToolName})` : ""}
            </span>
            {liveToolName ? (
              <span className="tool-source">Message sent by {liveToolName}.</span>
            ) : (
              <span className="tool-source">Message sent by tool.</span>
            )}
            {liveToolArgs ? <span className="tool-source">Args: {liveToolArgs}</span> : null}
            {liveTool ? <pre>{liveTool}</pre> : <p className="status">Waiting for tool output...</p>}
          </article>
        ) : null}

        {liveAssistant ? (
          <article className="live-panel">
            <span className="role">assistant stream</span>
            <p>{liveAssistant}</p>
          </article>
        ) : null}

        {messages.map((message) => (
          <article key={message.id} className={`bubble bubble-${message.role}`}>
            <span className="role">{message.role}</span>
            <p>{message.text}</p>
            <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString()}</time>
          </article>
        ))}
      </section>

      <form className="chat-compose" onSubmit={onSubmit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask the agent..."
          rows={3}
          disabled={sending}
        />
        <button type="submit" disabled={!canSend}>
          {sending ? "Sending..." : "Send"}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
