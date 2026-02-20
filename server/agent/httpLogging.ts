const PATCHED_FLAG = Symbol.for("pi.outboundRequestLogger");

const DEFAULT_LOG_ENV = "PI_LOG_PROVIDER_HEADERS";
const DEFAULT_HOSTS = ["api.openai.com", "openai.com"];

type FetchLike = typeof fetch;

type LoggerOptions = {
  enabled?: boolean;
  hosts?: string[];
};

function envFlag(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return defaultValue;
  }
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) {
    return init.method;
  }
  if (typeof input === "string" || input instanceof URL) {
    return "GET";
  }
  return input.method || "GET";
}

function getHeaderValue(headers: HeadersInit | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }
  const lowerName = name.toLowerCase();
  if (headers instanceof Headers) {
    return headers.get(lowerName) ?? undefined;
  }
  if (Array.isArray(headers)) {
    const entry = headers.find(([key]) => key.toLowerCase() === lowerName);
    return entry?.[1];
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return String(value);
    }
  }
  return undefined;
}

function pickHeaderValue(input: RequestInfo | URL, init: RequestInit | undefined, name: string): string | undefined {
  const fromInit = getHeaderValue(init?.headers, name);
  if (fromInit) {
    return fromInit;
  }
  if (typeof input === "string" || input instanceof URL) {
    return undefined;
  }
  return getHeaderValue(input.headers, name);
}

function maskToken(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length <= 12) {
    return "***";
  }
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

function maskAuthorizationHeader(value: string): string {
  const trimmed = value.trim();
  const parts = trimmed.split(/\s+/, 2);
  if (parts.length === 2) {
    return `${parts[0]} ${maskToken(parts[1])}`;
  }
  return maskToken(trimmed);
}

function shouldLogUrl(url: string, hosts: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
  } catch {
    return false;
  }
}

function formatHeaderStatus(value: string | undefined): string {
  if (!value) {
    return "missing";
  }
  return maskAuthorizationHeader(value);
}

function logOutboundRequest(url: string, method: string, authHeader: string | undefined) {
  console.log(
    `[http] outbound request host=openai method=${method} auth=${formatHeaderStatus(authHeader)}`,
  );
}

export function installOutboundRequestLogger(options: LoggerOptions = {}): void {
  const enabled = options.enabled ?? envFlag(DEFAULT_LOG_ENV, false);
  if (!enabled) {
    return;
  }

  if (!globalThis.fetch) {
    return;
  }

  const existing = (globalThis as Record<symbol, unknown>)[PATCHED_FLAG];
  if (existing) {
    return;
  }

  const originalFetch: FetchLike = globalThis.fetch.bind(globalThis);
  (globalThis as Record<symbol, unknown>)[PATCHED_FLAG] = originalFetch;
  const hosts = options.hosts ?? DEFAULT_HOSTS;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = getRequestUrl(input);
    if (shouldLogUrl(url, hosts)) {
      const method = getRequestMethod(input, init);
      const authHeader =
        pickHeaderValue(input, init, "authorization") ?? pickHeaderValue(input, init, "x-api-key");
      logOutboundRequest(url, method, authHeader);
    }
    return originalFetch(input as never, init as never);
  }) as FetchLike;
}

export const __testing__ = {
  getHeaderValue,
  maskAuthorizationHeader,
  maskToken,
  pickHeaderValue,
  shouldLogUrl,
};
