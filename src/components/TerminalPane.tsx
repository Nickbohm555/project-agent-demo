import { FormEvent, useMemo, useState } from "react";
import { executeCodexAction } from "../lib/api";
import type { CodexAction } from "../types/chat";
import { mergeCodexOutput } from "./terminal/terminalOutput";
import { TerminalComposer } from "./terminal/TerminalComposer";
import { TerminalHeader } from "./terminal/TerminalHeader";
import { TerminalLog } from "./terminal/TerminalLog";
import type { TerminalLine } from "./terminal/types";

type TerminalPaneProps = {
  sessionId: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

export function TerminalPane({ sessionId }: TerminalPaneProps) {
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: `boot-${Date.now()}`,
      kind: "info",
      text: "Codex terminal ready. Click Start to begin a persistent Codex session, then send prompts below.",
      createdAt: nowIso(),
    },
  ]);

  const canStart = useMemo(() => !busy && !running, [busy, running]);
  const canSend = useMemo(() => !busy && running && prompt.trim().length > 0, [busy, running, prompt]);

  function append(kind: TerminalLine["kind"], text: string) {
    setLines((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind,
        text,
        createdAt: nowIso(),
      },
    ]);
  }

  async function runAction(action: CodexAction, withPrompt?: string) {
    setBusy(true);
    try {
      const response = await executeCodexAction({
        sessionId,
        action,
        prompt: withPrompt,
      });

      if (action === "start" || action === "status") {
        const isRunning = typeof response.details?.running === "boolean" ? Boolean(response.details.running) : running;
        setRunning(isRunning);
      }
      if (action === "stop") {
        setRunning(false);
      }
      if (action === "continue") {
        setRunning(true);
      }

      const outputs = mergeCodexOutput(response.streamText, response.text);
      outputs.forEach((output) => append("output", output));
    } catch (err) {
      append("error", String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) {
      if (!running) {
        append("info", "Start the Codex session first, then send your prompt.");
      }
      return;
    }

    const command = prompt.trim();
    setPrompt("");
    append("command", `$ ${command}`);

    await runAction("continue", command);
  }

  async function onStart() {
    append("info", "Starting Codex session...");
    await runAction("start");
  }

  async function onStatus() {
    append("info", "Checking Codex session status...");
    await runAction("status");
  }

  async function onStop() {
    append("info", "Stopping Codex session...");
    await runAction("stop");
  }

  function onClear() {
    setLines([]);
  }

  return (
    <section className="terminal-shell" aria-label="Codex terminal">
      <TerminalHeader
        sessionId={sessionId}
        busy={busy}
        running={running}
        canStart={canStart}
        onStart={onStart}
        onStatus={onStatus}
        onStop={onStop}
        onClear={onClear}
      />
      <TerminalLog lines={lines} />
      <TerminalComposer
        prompt={prompt}
        busy={busy}
        running={running}
        canSend={canSend}
        onPromptChange={setPrompt}
        onSubmit={onSubmit}
      />
    </section>
  );
}
