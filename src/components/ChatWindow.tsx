import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchHistory, sendMessage } from "../lib/api";
import type { ChatMessage } from "../types/chat";

type ChatWindowProps = {
  sessionId: string;
};

export function ChatWindow({ sessionId }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchHistory(sessionId)
      .then((session) => {
        if (!cancelled) {
          setMessages(session.messages);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
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
      const result = await sendMessage({ sessionId, message: text });
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
        <p>OpenClaw-style data flow: UI → API → Service → Embedded Runtime</p>
      </header>

      <section className="chat-log" aria-live="polite">
        {loading ? <p className="status">Loading chat...</p> : null}
        {!loading && messages.length === 0 ? <p className="status">No messages yet.</p> : null}

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
