import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCodexRouter } from "../../server/agent/codexRouter.js";

async function withServer(run: (baseUrl: string) => Promise<void>, appFactory: () => express.Express) {
  const app = appFactory();
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const addr = server.address();
  if (!addr || typeof addr === "string") {
    server.close();
    throw new Error("Failed to resolve server address");
  }

  try {
    await run(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("codexRouter", () => {
  it("returns 400 for invalid payload", async () => {
    await withServer(
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/codex/execute`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "start" }),
        });

        expect(res.status).toBe(400);
      },
      () => {
        const app = express();
        app.use(express.json());
        app.use(
          "/api/codex",
          buildCodexRouter({
            cliToolEnabled: true,
            cliWorkdir: "/tmp",
            cliTimeoutSeconds: 45,
            cliAllowedPrefixes: [],
            codexToolEnabled: true,
            codexWorkdir: "/tmp",
          }),
        );
        return app;
      },
    );
  });

  it("returns 409 when codex is disabled", async () => {
    await withServer(
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/codex/execute`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: "s1", action: "status" }),
        });

        expect(res.status).toBe(409);
      },
      () => {
        const app = express();
        app.use(express.json());
        app.use(
          "/api/codex",
          buildCodexRouter({
            cliToolEnabled: true,
            cliWorkdir: "/tmp",
            cliTimeoutSeconds: 45,
            cliAllowedPrefixes: [],
            codexToolEnabled: false,
            codexWorkdir: "/tmp",
          }),
        );
        return app;
      },
    );
  });

  it("executes action and returns codex response payload", async () => {
    const execute = vi.fn(async () => ({
      text: "status ok",
      streamText: "",
      details: { running: true },
    }));

    await withServer(
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/codex/execute`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: "s1", action: "status" }),
        });

        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          ok: boolean;
          text: string;
          details?: { running?: boolean };
        };
        expect(body.ok).toBe(true);
        expect(body.text).toBe("status ok");
        expect(body.details?.running).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
      },
      () => {
        const app = express();
        app.use(express.json());
        app.use(
          "/api/codex",
          buildCodexRouter(
            {
              cliToolEnabled: true,
              cliWorkdir: "/tmp",
              cliTimeoutSeconds: 45,
              cliAllowedPrefixes: [],
              codexToolEnabled: true,
              codexWorkdir: "/tmp",
            },
            { execute },
          ),
        );
        return app;
      },
    );
  });
});
