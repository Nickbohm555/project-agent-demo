export type TerminalLineKind = "info" | "error" | "command" | "output";

export type TerminalLine = {
  id: string;
  kind: TerminalLineKind;
  text: string;
  createdAt: string;
};
