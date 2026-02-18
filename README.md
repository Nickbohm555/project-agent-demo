# Project Agent Demo

Minimal scaffold for learning OpenClaw-style agent architecture by building it end-to-end.

## What this includes

- Basic web chat UI (React + Vite)
- API layer (`/api/chat/history`, `/api/chat/send`)
- Chat service layer with session state and run IDs
- Runtime adapter boundary:
  - `embedded-pi` runtime (default) for `@mariozechner/pi-*` (starts with no tools; optional CLI tool)
  - optional `mock` runtime for offline/local testing
- Per-agent PI session store keyed by `agentId`
- Architecture docs showing data flow and next implementation steps

## Quick start

```bash
pnpm install
pnpm dev
```

- Web app: `http://localhost:5173`
- API server: `http://localhost:3001`

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

# Optional: enable CLI tool (bash) for agent runs
PI_ENABLE_CLI_TOOL=false
# Optional command guard; when set, commands must start with one of these
PI_CLI_ALLOWED_PREFIXES=pwd,ls,cat,echo
# Optional tool runtime settings
PI_CLI_TIMEOUT_SECONDS=45
PI_CLI_WORKDIR=/absolute/path/to/project-agent-demo

# Codex tool (enabled by default)
PI_ENABLE_CODEX_TOOL=true
```

Provider key mapping is exposed in `GET /api/agent/runtime`.
Readiness quick check:

```bash
curl -s http://localhost:3001/api/agent/runtime
curl -s http://localhost:3001/api/health
```

The server auto-loads `.env` from the project root on startup.

When `PI_ENABLE_CLI_TOOL=true`, embedded PI sessions are created with a bash CLI tool.
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

### Agent debug logging

You can log agent internals during a run:

```bash
PI_LOG_EVENTS=true
# or narrower logs:
PI_LOG_ASSISTANT_DELTAS=true
PI_LOG_TOOL_EVENTS=true
# highest verbosity:
PI_LOG_RAW_EVENTS=true
```

Note: provider-hidden reasoning/thought traces are generally not exposed by APIs.
These logs show observable agent events, assistant deltas, and tool lifecycle events.

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
