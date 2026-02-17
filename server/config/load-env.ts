import fs from "node:fs";
import path from "node:path";
import { config as dotenvConfig } from "dotenv";

export type EnvLoadResult = {
  loaded: boolean;
  path: string;
};

export function loadEnvironmentFromDotenv(cwd: string = process.cwd()): EnvLoadResult {
  const envPath = path.join(cwd, ".env");
  if (!fs.existsSync(envPath)) {
    return { loaded: false, path: envPath };
  }

  dotenvConfig({
    path: envPath,
    override: false,
  });

  return { loaded: true, path: envPath };
}
