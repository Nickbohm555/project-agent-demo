import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchHistory, sendMessage } from "../lib/api";
import type { ChatMessage, ChatStreamEvent } from "../types/chat";

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
    const eventSource = new EventSource(`/api/chat/stream?sessionId=${encodeURIComponent(sessionId)}`);
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as ChatStreamEvent;
        if (payload.type === "lifecycle" && payload.phase === "start") {
          setLiveAssistant("");
          setLiveTool("");
          return;
        }
        if (payload.type === "assistant_delta" && payload.text) {
          setLiveAssistant(payload.text);
          return;
        }
        if (payload.type === "tool_output" && payload.text) {
          setLiveTool((current) => `${current}${payload.text}`.slice(-12_000));
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
        <h1>Project Agent Demo</h1>
        <p>
          OpenClaw-style data flow: UI → API → Service → Embedded Runtime
          <br />
          Agent: <strong>{agentId}</strong>
        </p>
      </header>

      <section className="chat-log" aria-live="polite">
        {loading ? <p className="status">Loading chat...</p> : null}
        {messages.length === 0 ? <p className="status">No messages yet.</p> : null}

        {liveTool ? (
          <article className="live-panel">
            <span className="role">tool stream</span>
            <pre>{liveTool}</pre>
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
