import type { FormEvent } from "react";

type TerminalComposerProps = {
  prompt: string;
  busy: boolean;
  running: boolean;
  canSend: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> | void;
  onPromptChange: (value: string) => void;
};

export function TerminalComposer({
  prompt,
  busy,
  running,
  canSend,
  onSubmit,
  onPromptChange,
}: TerminalComposerProps) {
  return (
    <form className="terminal-compose" onSubmit={onSubmit}>
      <textarea
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        placeholder={running ? "Send prompt to Codex session..." : "Start session and send prompt..."}
        rows={3}
        disabled={busy}
      />
      <button type="submit" disabled={!canSend}>
        {busy ? "Running..." : running ? "Send" : "Start/Send"}
      </button>
    </form>
  );
}
