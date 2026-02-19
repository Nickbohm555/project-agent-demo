import { useState } from "react";
import { ChatWindow } from "./components/ChatWindow";
import { TerminalPane } from "./components/TerminalPane";

export default function App() {
  const [activeTab, setActiveTab] = useState<"chat" | "terminal">("chat");
  const sessionId = "demo-session";
  const agentId = "agent-demo";

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
      </nav>

      {activeTab === "chat" ? (
        <ChatWindow agentId={agentId} sessionId={sessionId} />
      ) : (
        <TerminalPane sessionId={sessionId} />
      )}
    </main>
  );
}
