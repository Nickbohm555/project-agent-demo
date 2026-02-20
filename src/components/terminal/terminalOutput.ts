export function mergeCodexOutput(streamText: string, text: string): string[] {
  const normalizedStream = (streamText ?? "").trim();
  const normalizedText = (text ?? "").trim();
  if (!normalizedStream && !normalizedText) {
    return [];
  }
  if (normalizedStream && normalizedText && normalizedStream === normalizedText) {
    return [normalizedStream];
  }
  if (normalizedStream && normalizedText) {
    return [normalizedStream, normalizedText];
  }
  return [normalizedStream || normalizedText];
}
