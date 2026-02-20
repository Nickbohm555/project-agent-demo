import { useEffect, useRef } from "react";
import type { TerminalLine } from "./types";

type TerminalLogProps = {
  lines: TerminalLine[];
};

export function TerminalLog({ lines }: TerminalLogProps) {
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!logRef.current) {
      return;
    }
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  return (
    <div className="terminal-screen" role="log" aria-live="polite" ref={logRef}>
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
