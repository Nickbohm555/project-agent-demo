import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvironmentFromDotenv } from "../../server/config/load-env.js";

const KEY = "PROJECT_AGENT_DEMO_DOTENV_TEST";

afterEach(() => {
  delete process.env[KEY];
});

describe("loadEnvironmentFromDotenv", () => {
  it("loads values from .env in provided cwd", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pad-dotenv-"));
    await fs.writeFile(path.join(dir, ".env"), `${KEY}=from_file\n`, "utf8");

    const result = loadEnvironmentFromDotenv(dir);

    expect(result.loaded).toBe(true);
    expect(process.env[KEY]).toBe("from_file");
  });

  it("does not override existing env values", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pad-dotenv-"));
    await fs.writeFile(path.join(dir, ".env"), `${KEY}=from_file\n`, "utf8");
    process.env[KEY] = "from_shell";

    loadEnvironmentFromDotenv(dir);

    expect(process.env[KEY]).toBe("from_shell");
  });
});
