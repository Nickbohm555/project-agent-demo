type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
};

export class InboundDeduper {
  private seen = new Set<string>();

  has(sourceMessageId: string): boolean {
    return this.seen.has(sourceMessageId);
  }

  mark(sourceMessageId: string): void {
    this.seen.add(sourceMessageId);
  }
}

export async function withRetry<T>(
  run: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const attempts = options?.attempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 150;

  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (i === attempts - 1) {
        break;
      }
      const delayMs = baseDelayMs * 2 ** i;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

