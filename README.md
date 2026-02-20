# Project Agent Demo

Minimal scaffold for learning OpenClaw-style agent architecture by building it end-to-end.

## What this includes

- Basic web chat UI (React + Vite)
- Secondary Terminal tab for direct Codex session control (`start` / `continue` / `status` / `stop`)
- API layer (`/api/chat/history`, `/api/chat/send`)
- Codex terminal API (`POST /api/codex/execute`)
- Optional host-side Codex bridge (`server/codexBridgeServer.ts`) for Docker deployments where in-container Codex networking is unstable
- Chat service layer with session state and run IDs
- Runtime adapter boundary:
  - `embedded-pi` runtime (default) for `@mariozechner/pi-*` (starts with no tools)
  - optional `mock` runtime for offline/local testing
- Per-agent PI session store keyed by `agentId`
- Architecture docs showing data flow and next implementation steps

## Quick start

```bash
pnpm install
pnpm dev
```

- Web app: `http://localhost:43218`
- API server: `http://localhost:43217`

## Quick start (Docker)

```bash
docker compose up --build
```

- Web app: `http://localhost:43218`
- API server: `http://localhost:43217`

Notes:
- `docker compose` loads variables from `.env` via `env_file`.
- Container defaults `PI_ENABLE_CODEX_TOOL=true` so custom Codex tool is available to the agent by default.
- Container defaults `PI_CODEX_WORKDIR=/Users/nickbohm/Desktop/Projects` (case-sensitive) for Codex runs.
- Container defaults `PI_CODEX_BRIDGE_URL=http://host.docker.internal:43319` so Codex actions can be proxied to a host-run bridge.
- Compose mounts `/Users/nickbohm/.codex` into `/root/.codex` so containerized Codex can reuse host login/auth.
- Compose maps `host.docker.internal` to host gateway for Linux compatibility.
- Vite host binding is controlled by `PAD_WEB_HOST` (defaults to `0.0.0.0` in `docker-compose.yml`).
- Container defaults `PI_LOG_TOOL_EVENTS=true` so tool lifecycle usage is visible in `docker compose logs -f app`.
- Container defaults `PI_LOG_CODEX_TOOL=true` so Codex action/error lifecycle logs are visible in container logs.
- WhatsApp gateway init checks are built into container startup.
  - `PI_WHATSAPP_PROVIDER=baileys`: auto-creates auth dir and starts a Baileys listener.
  - `PI_WHATSAPP_PROVIDER=cloud-api`: startup fails fast unless required Cloud API env vars are present.
- Docker image installs `@openai/codex` CLI so `codex` tool calls can run in-container.
- After Dockerfile changes, rebuild to refresh the image:
  `docker compose up --build -d`

## Initialization script (Docker + GitHub auth)

If you want a guided, one-shot startup that also configures GitHub auth inside the container, use:

```bash
./scripts/setup-github-auth.sh
```

What it does:
- Verifies `docker` and `docker compose` are available.
- Prompts for optional WhatsApp gateway settings, then brings up the `app` container.
- Configures `git user.name` / `git user.email` inside the container.
- Runs `gh auth login` and verifies `gh auth status`.

Notes:
- This script is best when you plan to work inside the container and need GitHub access there.
- It sets WhatsApp-related env vars only for that run; it does not write `.env`.

### Recommended Codex setup with Docker

Run Codex on the host and proxy from Docker API:

```bash
pnpm dev:codex-bridge
docker compose up --build
```

Bridge defaults:
- `PI_CODEX_BRIDGE_PORT=43319`
- `PI_CODEX_WORKDIR=/Users/nickbohm/Desktop/Projects`

## Framework and architecture (so far)

Frameworks:
- Frontend: React 19 + Vite 7 (`src/`)
- Backend: Express 5 + TypeScript (`server/`)
- Agent runtime: `@mariozechner/pi-*` packages (embedded PI + optional mock)
- Tests: Vitest (`test/`)

Architecture snapshot:
- UI -> API -> service -> runtime boundaries with explicit session/run state.
- Chat endpoints: `/api/chat/send`, `/api/chat/history`, `/api/chat/stream` (SSE).
- Long-lived Codex sessions managed per thread (`start`/`continue`/`status`/`stop`).
- Runtime adapters (`embedded-pi`, `mock`) and tool config toggles (`codex`).

See `docs/architecture.md` for a full data-flow diagram and layer responsibilities.

## Gateway logic (so far)

The gateway layer adapts external channels into the same chat pipeline:

- `server/gateway/core/*`: shared types + routing.
  - `GatewayRouter` dedupes inbound messages, resolves a sessionId, and forwards to `ChatService`.
  - `ConversationSessionStore` maps `(channel, conversationId)` to a stable `sessionId`.
  - `InboundDeduper` prevents repeat processing of the same provider message id.
- WhatsApp:
  - Provider `"baileys"` runs a persistent socket (auto-start via `PI_WHATSAPP_AUTO_START=true`).
  - Provider `"cloud-api"` exposes `POST /api/webhooks/whatsapp` for Meta Cloud API webhooks.
  - Channel adapters normalize inbound events into `InternalMessage` and send outbound replies.

Gateway configuration is loaded from env in `server/gateway/config.ts`.

## Runtime mode and model config

Default mode is embedded PI:

```bash
pnpm dev
```

Use mock mode only when needed:

```bash
AGENT_RUNTIME=mock pnpm dev:server
```

`embedded-pi` executes a basic PI turn and keeps one in-memory PI session per `agentId`.

### Required env for real model calls

```bash
# Runtime selection (optional; default is embedded-pi)
AGENT_RUNTIME=embedded-pi

# Model selection
PI_PROVIDER=openai
PI_MODEL=gpt-4.1-mini
PI_THINKING_LEVEL=off

# API key (required for PI provider call)
OPENAI_API_KEY=your_key_here

# Codex tool (enabled by default)
PI_ENABLE_CODEX_TOOL=true
# Optional: send codex actions to host bridge instead of running codex in this process
PI_CODEX_BRIDGE_URL=http://127.0.0.1:43319

# Optional WhatsApp gateway bootstrap checks (Docker entrypoint)
PI_ENABLE_WHATSAPP_GATEWAY=false

# Choose provider: "baileys" (OpenClaw-style persistent WA Web socket) or "cloud-api"
PI_WHATSAPP_PROVIDER=baileys
PI_WHATSAPP_AUTO_START=true
PI_WHATSAPP_AUTH_DIR=/absolute/path/to/auth-dir
PI_WHATSAPP_PRINT_QR=true

# Cloud API mode vars (required only when PI_WHATSAPP_PROVIDER=cloud-api)
WHATSAPP_ACCESS_TOKEN=your_whatsapp_cloud_api_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_VERIFY_TOKEN=your_webhook_verify_token
WHATSAPP_WEBHOOK_VALIDATE_SIGNATURE=true
WHATSAPP_APP_SECRET=your_meta_app_secret
```

When `PI_ENABLE_WHATSAPP_GATEWAY=true` and `PI_WHATSAPP_PROVIDER=baileys`:
- the server starts a persistent Baileys session and routes inbound WhatsApp messages through the same agent pipeline as chat.
- first-time linking prints a QR code in server logs (`PI_WHATSAPP_PRINT_QR=true`).

Provider key mapping is exposed in `GET /api/agent/runtime`.
Readiness quick check:

```bash
curl -s http://localhost:43217/api/agent/runtime
curl -s http://localhost:43217/api/health
```

The server auto-loads `.env` from the project root on startup.

Codex tool runs:
`codex --dangerously-bypass-approvals-and-sandbox`
in `/Users/nickbohm/Desktop/Projects`.

Codex terminal persistence:
- one long-lived Codex process is reused per chat thread (`sessionId`)
- tool actions:
: `start`, `continue` (send prompt), `status`, `stop`

Live streaming:
- UI subscribes to `/api/chat/stream?sessionId=...` (SSE)
- tool stdout/stderr and assistant deltas stream into the chat UI in real time

Terminal tab behavior:
- `Start/Send`: starts Codex session if needed, then sends prompt as `continue`
- `Status`: checks whether the persistent Codex session is running
- `Stop`: stops the persistent Codex session for the current thread

When `PI_CODEX_BRIDGE_URL` is set:
- both Terminal API calls and in-agent custom `codex` tool calls are proxied to the bridge.
- session persistence is managed by the bridge process.

### Agent debug logging

You can log agent internals during a run:

```bash
PI_LOG_EVENTS=true
# or narrower logs:
PI_LOG_ASSISTANT_DELTAS=true
PI_LOG_TOOL_EVENTS=true
# highest verbosity:
PI_LOG_RAW_EVENTS=true
# Codex tool action/error logs:
PI_LOG_CODEX_TOOL=true
```

Note: provider-hidden reasoning/thought traces are generally not exposed by APIs.
These logs show observable agent events, assistant deltas, and tool lifecycle events.
Codex logs expose action-level steps (start/status/continue/stop), stream stats, and surfaced errors.

Runtime startup logs now include:
- configured tool list (`codex`)
- codex workdir
- active logging flags

For container log tailing:

```bash
docker compose logs -f app
```

## Scripts

- `pnpm dev`: run web + server together
- `pnpm build`: build web assets and server TS output
- `pnpm test`: run unit tests

## Folder map

- `src/`: chat UI and browser API client
- `server/`: API routes, chat service, runtime adapters
- `docs/`: architecture and flow docs
- `test/`: unit tests

## Inspired by OpenClaw

This project mirrors the same shape used in OpenClaw docs:

- `UI -> API -> agent runner`
- explicit runtime boundaries
- run IDs and session-scoped transcript state

See `docs/architecture.md` for the concrete mapping.
