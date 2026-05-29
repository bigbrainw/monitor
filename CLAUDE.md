# Monitor — AI Agent Fleet Orchestrator

Local dashboard that detects every AI agent running on this machine (Claude Code, Codex, Cursor, Gemini), persists their memory across sessions via XTrace, and provides a GPT-4o orchestrator to manage them all through a single chat interface.

## Run

```bash
npm install
npm run dev   # localhost:3001
```

Requires `.env.local`:
```
XTRACE_API_KEY=xtk_...
XTRACE_ORG_ID=...
OPENAI_API_KEY=sk-...
```

## Architecture

```
app/page.tsx          — entire UI (two tabs: Agents grid + Orchestrator chat)
app/api/scan/         — detects running processes, ingests Claude sessions → XTrace
app/api/chat/         — streaming GPT-4o orchestrator with tool use (SSE)
app/api/agents/       — CRUD for agents
app/api/tasks/        — CRUD for tasks (auto-ingests to XTrace on create/update)
app/api/memories/     — proxies XTrace search/list per agent
lib/tools.ts          — all orchestrator tool definitions + executors
lib/ingest.ts         — ingests Claude JSONL sessions + task events → XTrace
lib/xtrace.ts         — XTrace MemoryClient singleton
db/schema.ts          — Drizzle schema: projects, agents, tasks, goals, memory_sync
db/index.ts           — SQLite init + additive migrations
```

## Data flow

1. `/api/scan` (polled every 10s) — reads `~/.claude/projects/**/*.jsonl`, calls `ingestClaudeSession()` for new lines → XTrace stores as facts/episodes
2. Task create/update → `ingestTaskEvent()` fires async → XTrace
3. User prompt → `/api/chat` → GPT-4o streams with tools → `executeTool()` hits DB + XTrace directly
4. Tool results containing agent arrays → rendered as visual cards in chat

## Orchestrator tools

| Tool | What it does |
|------|-------------|
| `get_project_overview` | Full fleet: stage, plan, risks, tasks per agent. Renders as card grid. |
| `list_agents` | All agents + status + tasks |
| `get_agent_context` | One agent: XTrace memories + tasks + notes |
| `search_all_memory` | XTrace search across ALL agents |
| `update_agent_plan` | Set stage / markdown plan / risks for an agent |
| `create_task` | New task on an agent |
| `update_task` | Change task status/title |
| `create_project` | New project |
| `assign_agent_to_project` | Link agent → project |
| `update_agent_status` | idle / running / done / blocked |
| `list_projects` | All projects + goals |
| `get_running_processes` | Live running agents from DB |

## Adding a new tool

1. Add definition to `TOOL_DEFINITIONS` in `lib/tools.ts`
2. Add `case 'tool_name':` in `executeTool()` switch
3. Add icon to `TOOL_ICONS` map in `app/page.tsx`

## Agent schema

```ts
agents {
  id, name, type       // claude | codex | cursor | gemini | other
  status               // running | idle | done | blocked
  pid, autoDetected    // set by scan
  notes                // cwd + session summary from JSONL
  stage                // "exploring" | "building" | "debugging" | "shipping" | "shipped"
  plan                 // markdown: goals, milestones
  risks                // markdown: anticipated blockers
  projectId            // optional project grouping
}
```

## XTrace memory namespacing

- `user_id` = `String(agentId)` — scopes memories per agent
- `conv_id` = session UUID (Claude) or `"tasks-{agentId}"` (synthetic)
- `memory_sync` table tracks last ingested line count per JSONL file (prevents re-ingestion)
