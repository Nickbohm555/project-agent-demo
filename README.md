# Project Agent Demo

Minimal scaffold for learning OpenClaw-style agent architecture by building it end-to-end.

## What this includes

- Basic web chat UI (React + Vite)
- API layer (`/api/chat/history`, `/api/chat/send`)
- Chat service layer with session state and run IDs
- Runtime adapter boundary:
  - `mock` runtime (default, works out of the box)
  - `embedded-pi` runtime scaffold for `@mariozechner/pi-*` (`tools: []`)
- Per-agent PI session store keyed by `agentId`
- Architecture docs showing data flow and next implementation steps

## Quick start

```bash
pnpm install
pnpm dev
```

- Web app: `http://localhost:5173`
- API server: `http://localhost:3001`

## Runtime modes

Default mode is mock:

```bash
pnpm dev
```

Try embedded PI scaffold mode:

```bash
AGENT_RUNTIME=embedded-pi pnpm dev:server
```

Note: `embedded-pi` now executes a basic PI turn with no tools and keeps one in-memory PI session per `agentId`.

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
