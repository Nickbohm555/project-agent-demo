const DEFAULT_WEB_PORT = 43218;
const DEFAULT_API_PORT = 43217;
const DEFAULT_WEB_HOST = "127.0.0.1";

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveWebPort(env: NodeJS.ProcessEnv = process.env): number {
  return parsePort(env.PAD_WEB_PORT, DEFAULT_WEB_PORT);
}

export function resolveWebHost(env: NodeJS.ProcessEnv = process.env): string {
  const host = env.PAD_WEB_HOST?.trim();
  return host && host.length > 0 ? host : DEFAULT_WEB_HOST;
}

export function resolveProxyApiPort(env: NodeJS.ProcessEnv = process.env): number {
  return parsePort(env.PAD_API_PORT, DEFAULT_API_PORT);
}

export function resolveApiPort(env: NodeJS.ProcessEnv = process.env): number {
  const productionPort = env.NODE_ENV === "production" ? env.PORT : undefined;
  return parsePort(env.PAD_API_PORT ?? productionPort, DEFAULT_API_PORT);
}
