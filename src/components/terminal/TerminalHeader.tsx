type TerminalHeaderProps = {
  sessionId: string;
  busy: boolean;
  running: boolean;
  canStart: boolean;
  onStart: () => void;
  onStatus: () => void;
  onStop: () => void;
  onClear: () => void;
};

export function TerminalHeader({
  sessionId,
  busy,
  running,
  canStart,
  onStart,
  onStatus,
  onStop,
  onClear,
}: TerminalHeaderProps) {
  return (
    <header className="terminal-header">
      <div>
        <strong>Terminal</strong>
        <p>Session: {sessionId}</p>
      </div>
      <div className="terminal-actions">
        <button type="button" onClick={onStart} disabled={!canStart}>
          Start
        </button>
        <button type="button" onClick={onStatus} disabled={busy}>
          Status
        </button>
        <button type="button" onClick={onStop} disabled={busy || !running}>
          Stop
        </button>
        <button type="button" onClick={onClear} disabled={busy}>
          Clear
        </button>
      </div>
    </header>
  );
}
