import type { TerminalLine } from "./types";

type TerminalLogProps = {
  lines: TerminalLine[];
};

export function TerminalLog({ lines }: TerminalLogProps) {
  return (
    <div className="terminal-screen" role="log" aria-live="polite">
      {lines.map((line) => (
        <div key={line.id} className={`terminal-line terminal-${line.kind}`}>
          <span className="terminal-time">{new Date(line.createdAt).toLocaleTimeString()}</span>
          <span>{line.text}</span>
        </div>
      ))}
      {lines.length === 0 ? <div className="terminal-line terminal-info">No terminal output yet.</div> : null}
    </div>
  );
}
