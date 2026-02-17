# Architecture (OpenClaw-style, Minimal)

## Goal

Build a small project with the same control flow style as OpenClaw's agent loop and WebChat path, but without gateway/protocol complexity.

## Data flow

```text
React Chat UI
  -> POST /api/chat/send
    -> ChatRouter validates payload
      -> ChatService appends user message
        -> AgentRuntime.run(...)
          -> MockAgentRuntime OR EmbeddedPiRuntime
            -> AgentSessionStore.getOrCreate(agentId)
              -> one PI AgentSession per agent
        -> ChatService appends assistant message
  <- returns session + run status

React Chat UI
  -> GET /api/chat/history
  <- returns session transcript
```

## Layer responsibilities

1. UI layer (`src/components/ChatWindow.tsx`)
- Renders transcript
- Sends user prompts
- Handles optimistic updates and errors

2. API layer (`server/chat/chatRouter.ts`)
- Validates request payloads
- Exposes stable chat endpoints
- Keeps transport concerns away from agent runtime logic

3. Service layer (`server/chat/chatService.ts`)
- Owns per-session transcript state
- Creates run context from conversation history
- Normalizes runtime outputs to app-level response

4. Runtime layer (`server/agent/*`)
- `MockAgentRuntime`: deterministic local behavior
- `EmbeddedPiRuntime`: actual `createAgentSession` scaffold with `tools: []`
- `AgentSessionStore`: keeps one in-memory PI session per `agentId`

## OpenClaw concept mapping

- OpenClaw `chat.send` + `chat.history` behavior -> `/api/chat/send` + `/api/chat/history`
- OpenClaw run IDs + run status -> `run.id` + `run.status`
- OpenClaw embedded PI runner boundary -> `AgentRuntime` interface
- OpenClaw session transcript management -> `ChatService` in-memory session map
- Per-agent runtime sessions -> `AgentSessionStore` map keyed by `agentId`

## Next build steps

1. Add streaming endpoint (SSE or WebSocket) for token deltas from PI events.
2. Add run queue per `sessionId`/`agentId` to serialize overlapping sends.
3. Move session stores from memory to SQLite/file-backed store.
4. Add tool execution adapter and tool event stream.
5. Add auth + multi-session management.
