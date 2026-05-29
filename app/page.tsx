'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'

// ─── Types ────────────────────────────────────────────────────────────────────

type Task = { id: number; title: string; status: string; priority: string }
type Agent = {
  id: number; name: string; type: string; status: string
  pid: number | null; notes: string; stage: string
  plan: string; risks: string; updatedAt: string; tasks: Task[]
}
type Memory = { id: string; type: string; text: string; score?: number; created_at?: string }
type ToolCall = { name: string; result?: unknown }
type ChatMessage = { role: 'user' | 'assistant'; content: string; toolCalls?: ToolCall[] }

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_DOT: Record<string, string> = {
  claude: 'bg-violet-500', codex: 'bg-emerald-500',
  cursor: 'bg-sky-500', gemini: 'bg-amber-500', other: 'bg-slate-500',
}
const TYPE_RING: Record<string, string> = {
  claude: 'border-violet-700/40', codex: 'border-emerald-700/40',
  cursor: 'border-sky-700/40', gemini: 'border-amber-700/40', other: 'border-slate-700/40',
}
const STAGE_STYLE: Record<string, string> = {
  exploring:  'text-sky-400 bg-sky-900/30 border-sky-800/50',
  building:   'text-violet-400 bg-violet-900/30 border-violet-800/50',
  debugging:  'text-amber-400 bg-amber-900/30 border-amber-800/50',
  blocked:    'text-red-400 bg-red-900/30 border-red-800/50',
  shipping:   'text-emerald-400 bg-emerald-900/30 border-emerald-800/50',
  shipped:    'text-slate-400 bg-slate-800/50 border-slate-700/50',
}
const TOOL_ICONS: Record<string, string> = {
  list_agents: '⬡', get_agent_context: '◈', search_all_memory: '◉',
  create_task: '+', update_task: '✎', create_project: '▣',
  assign_agent_to_project: '↗', update_agent_status: '◎',
  get_running_processes: '⟳', list_projects: '▤',
  update_agent_plan: '✦', get_project_overview: '◫',
}

function stageBadge(stage: string) {
  const s = stage.toLowerCase()
  const cls = STAGE_STYLE[s] || 'text-slate-600 bg-slate-800/30 border-slate-700/30'
  return <span className={`text-[9px] rounded border px-1.5 py-px font-medium ${cls}`}>{stage}</span>
}

// ─── Shared agent loader ──────────────────────────────────────────────────────

function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([])
  const load = useCallback(async () => {
    try {
      await fetch('/api/scan')
      const data: Agent[] = await fetch('/api/agents').then(r => r.json())
      setAgents(data)
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t) }, [load])
  return { agents, reload: load }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 — AGENTS GRID
// ═══════════════════════════════════════════════════════════════════════════════

function agentTitle(agent: Agent): { title: string; subtitle: string } {
  const lines = (agent.notes ?? '').split('\n').map(l => l.trim()).filter(Boolean)
  const cwd = lines.find(l => l.startsWith('/'))
  const dirName = cwd ? cwd.split('/').filter(Boolean).pop() ?? '' : ''

  // Priority: plan first line title > dir name > agent name
  const planTitle = agent.plan
    ? agent.plan.replace(/^#+\s*/, '').split('\n')[0]?.replace(/[*`]/g, '').trim()
    : ''

  const title = planTitle && planTitle.length < 40
    ? planTitle
    : dirName || agent.name

  const subtitle = dirName && title !== dirName ? dirName : agent.type

  return { title, subtitle }
}

function AgentBlock({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  const dot = TYPE_DOT[agent.type] ?? TYPE_DOT.other
  const ring = TYPE_RING[agent.type] ?? TYPE_RING.other
  const isRunning = agent.status === 'running'
  const { title, subtitle } = agentTitle(agent)

  const lines = (agent.notes ?? '').split('\n').filter(l => l.trim().length > 3)
  const summary = lines.find(l => !l.startsWith('/') && !l.startsWith('Now:') && !l.startsWith('Goal:'))
    ?? lines.find(l => l.startsWith('Now:'))?.replace(/^Now:\s*/, '')

  const openTasks = (agent.tasks ?? []).filter(t => t.status !== 'done')
  const done = (agent.tasks ?? []).filter(t => t.status === 'done').length
  const pct = agent.tasks?.length ? Math.round((done / agent.tasks.length) * 100) : 0

  return (
    <button
      onClick={onClick}
      className={`group text-left rounded-xl border p-4 space-y-3 transition-all hover:scale-[1.01] active:scale-[0.99] ${
        isRunning
          ? `bg-slate-900 ${ring} border hover:border-opacity-80`
          : 'bg-slate-900/30 border-slate-800/20 hover:border-slate-800'
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-2.5">
        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dot} ${isRunning ? 'animate-pulse' : 'opacity-25'}`} />
        <div className="flex-1 min-w-0">
          <div className={`text-[13px] font-semibold truncate ${isRunning ? 'text-white' : 'text-slate-500'}`}>
            {title}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[10px] text-slate-700 font-mono truncate max-w-[120px]">{subtitle}</span>
            {agent.stage && <>{stageBadge(agent.stage)}</>}
            {!isRunning && <span className="text-[9px] text-slate-800">idle</span>}
          </div>
        </div>
        {isRunning && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mt-1 shrink-0" />}
      </div>

      {/* Current work */}
      {summary && (
        <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">{summary}</p>
      )}

      {/* Plan preview */}
      {agent.plan && (
        <p className="text-[11px] text-slate-600 leading-snug line-clamp-2 border-t border-slate-800/50 pt-2">{
          agent.plan.replace(/[#*`]/g, '').split('\n').find(l => l.trim()) ?? ''
        }</p>
      )}

      {/* Risks */}
      {agent.risks && (
        <div className="flex items-center gap-1 text-[10px] text-amber-800">
          <span>⚠</span>
          <span className="truncate">{agent.risks.replace(/[#*`\-]/g, '').split('\n').find(l => l.trim()) ?? ''}</span>
        </div>
      )}

      {/* Task bar */}
      {(agent.tasks?.length ?? 0) > 0 && (
        <div className="space-y-1 border-t border-slate-800/50 pt-2">
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-700">{openTasks.length} open</span>
            <span className="text-slate-800">{pct}%</span>
          </div>
          <div className="h-0.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-violet-600/70 rounded-full" style={{ width: `${pct}%` }} />
          </div>
          {openTasks.slice(0, 2).map(t => (
            <div key={t.id} className="flex items-center gap-1 text-[10px] text-slate-700">
              <span className={t.status === 'blocked' ? 'text-red-700' : ''}>
                {t.status === 'blocked' ? '!' : '·'}
              </span>
              <span className="truncate">{t.title}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  )
}

function AgentDetailPanel({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [memories, setMemories] = useState<Memory[]>([])
  const [memLoading, setMemLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'memory' | 'tasks'>('overview')

  useEffect(() => {
    setMemLoading(true)
    fetch(`/api/memories?agentId=${agent.id}&limit=20`)
      .then(r => r.json())
      .then(d => setMemories(d.memories ?? []))
      .catch(() => setMemories([]))
      .finally(() => setMemLoading(false))
  }, [agent.id])

  const lines = (agent.notes ?? '').split('\n').filter(l => l.trim().length > 3)
  const sessionSummary = lines.find(l => l.startsWith('Now:'))?.replace(/^Now:\s*/, '')
  const sessionGoal = lines.find(l => l.startsWith('Goal:'))?.replace(/^Goal:\s*/, '')
  const cwd = lines.find(l => l.startsWith('/'))

  const openTasks = (agent.tasks ?? []).filter(t => t.status !== 'done')
  const doneTasks = (agent.tasks ?? []).filter(t => t.status === 'done')

  const TASK_STATUS_COLOR: Record<string, string> = {
    'todo': 'text-slate-600', 'in-progress': 'text-violet-400',
    'done': 'text-emerald-600', 'blocked': 'text-red-500',
  }
  const MEM_TYPE_COLOR: Record<string, string> = {
    fact: 'border-violet-800/50 bg-violet-950/30',
    episode: 'border-amber-800/50 bg-amber-950/20',
    artifact: 'border-sky-800/50 bg-sky-950/20',
  }

  return (
    <div className="flex flex-col h-full border-l border-slate-800/60">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-800/60 flex items-start gap-3">
        <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${TYPE_DOT[agent.type] ?? TYPE_DOT.other} ${agent.status === 'running' ? 'animate-pulse' : 'opacity-30'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{agentTitle(agent).title}</span>
            {agent.stage && stageBadge(agent.stage)}
            <span className={`text-[10px] ${agent.status === 'running' ? 'text-emerald-400' : 'text-slate-600'}`}>
              {agent.status}
            </span>
          </div>
          {cwd && <div className="text-[10px] text-slate-700 font-mono mt-0.5 truncate">{cwd}</div>}
        </div>
        <button onClick={onClose} className="text-slate-700 hover:text-slate-400 transition-colors text-lg leading-none mt-0.5">×</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800/60 px-4 gap-4">
        {(['overview', 'memory', 'tasks'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`text-[11px] py-2.5 capitalize transition-colors border-b-2 ${
              tab === t ? 'text-white border-violet-500' : 'text-slate-600 border-transparent hover:text-slate-400'
            }`}>
            {t}
            {t === 'memory' && memories.length > 0 && (
              <span className="ml-1 text-[9px] text-slate-700">{memories.length}</span>
            )}
            {t === 'tasks' && agent.tasks?.length > 0 && (
              <span className="ml-1 text-[9px] text-slate-700">{openTasks.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <>
            {/* Session */}
            {(sessionSummary || sessionGoal) && (
              <div className="space-y-2">
                <div className="text-[9px] text-slate-700 uppercase tracking-widest">Current Session</div>
                {sessionSummary && (
                  <div className="bg-slate-900/60 border border-slate-800/60 rounded-lg p-3">
                    <div className="text-[9px] text-slate-700 mb-1">Now</div>
                    <p className="text-[12px] text-slate-300 leading-relaxed">{sessionSummary}</p>
                  </div>
                )}
                {sessionGoal && (
                  <div className="bg-slate-900/60 border border-slate-800/60 rounded-lg p-3">
                    <div className="text-[9px] text-slate-700 mb-1">Original Goal</div>
                    <p className="text-[12px] text-slate-400 leading-relaxed">{sessionGoal}</p>
                  </div>
                )}
              </div>
            )}

            {/* Plan */}
            {agent.plan && (
              <div className="space-y-1.5">
                <div className="text-[9px] text-slate-700 uppercase tracking-widest">Plan</div>
                <div className="text-[12px] text-slate-400 leading-relaxed">
                  <ReactMarkdown components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0 text-slate-400">{children}</p>,
                    strong: ({ children }) => <strong className="text-slate-200 font-semibold">{children}</strong>,
                    ul: ({ children }) => <ul className="space-y-1 mb-2">{children}</ul>,
                    li: ({ children }) => <li className="flex gap-2 text-slate-400"><span className="text-slate-700 shrink-0">·</span><span>{children}</span></li>,
                    h1: ({ children }) => <p className="font-semibold text-slate-300 mb-1 text-[13px]">{children}</p>,
                    h2: ({ children }) => <p className="font-medium text-slate-400 mb-0.5">{children}</p>,
                  }}>{agent.plan}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Risks */}
            {agent.risks && (
              <div className="space-y-1.5">
                <div className="text-[9px] text-amber-800 uppercase tracking-widest">⚠ Risks</div>
                <div className="border border-amber-900/30 bg-amber-950/10 rounded-lg p-3 text-[12px] text-amber-700/80 leading-relaxed">
                  <ReactMarkdown components={{
                    p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="space-y-1">{children}</ul>,
                    li: ({ children }) => <li className="flex gap-2"><span className="shrink-0">·</span><span>{children}</span></li>,
                  }}>{agent.risks}</ReactMarkdown>
                </div>
              </div>
            )}

            {!agent.plan && !agent.risks && !sessionSummary && (
              <p className="text-[11px] text-slate-700 text-center pt-4">No plan yet. Ask the orchestrator to create one.</p>
            )}
          </>
        )}

        {/* MEMORY TAB */}
        {tab === 'memory' && (
          <>
            {memLoading && (
              <div className="flex gap-1 justify-center pt-4">
                {[0,120,240].map(d => <span key={d} className="w-1.5 h-1.5 bg-slate-700 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
              </div>
            )}
            {!memLoading && memories.length === 0 && (
              <p className="text-[11px] text-slate-700 text-center pt-4">No memories yet.</p>
            )}
            {!memLoading && memories.map(m => (
              <div key={m.id} className={`rounded-lg border p-3 space-y-1 ${MEM_TYPE_COLOR[m.type] ?? 'border-slate-800 bg-slate-900/30'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-widest text-slate-700">{m.type}</span>
                  {m.score != null && <span className="text-[9px] text-slate-800">{(m.score * 100).toFixed(0)}%</span>}
                </div>
                <p className="text-[12px] text-slate-400 leading-relaxed">{m.text}</p>
                {m.created_at && (
                  <div className="text-[9px] text-slate-800">{new Date(m.created_at).toLocaleDateString()}</div>
                )}
              </div>
            ))}
          </>
        )}

        {/* TASKS TAB */}
        {tab === 'tasks' && (
          <>
            {openTasks.length === 0 && doneTasks.length === 0 && (
              <p className="text-[11px] text-slate-700 text-center pt-4">No tasks.</p>
            )}
            {openTasks.length > 0 && (
              <div className="space-y-1.5">
                {openTasks.map(t => (
                  <div key={t.id} className="flex items-center gap-3 bg-slate-900/60 border border-slate-800/60 rounded-lg px-3 py-2.5">
                    <span className={`text-[10px] shrink-0 ${TASK_STATUS_COLOR[t.status] ?? 'text-slate-600'}`}>
                      {t.status === 'in-progress' ? '▶' : t.status === 'blocked' ? '!' : '○'}
                    </span>
                    <span className="text-[12px] text-slate-300 flex-1">{t.title}</span>
                    <span className={`text-[9px] shrink-0 ${t.priority === 'high' ? 'text-red-600' : t.priority === 'low' ? 'text-slate-700' : 'text-slate-700'}`}>
                      {t.priority === 'high' ? '↑' : t.priority === 'low' ? '↓' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {doneTasks.length > 0 && (
              <details className="group mt-2">
                <summary className="text-[10px] text-slate-700 hover:text-slate-500 cursor-pointer list-none flex items-center gap-1 select-none">
                  <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                  {doneTasks.length} completed
                </summary>
                <div className="mt-2 space-y-1">
                  {doneTasks.map(t => (
                    <div key={t.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="text-[10px] text-emerald-800">✓</span>
                      <span className="text-[12px] text-slate-700 line-through flex-1">{t.title}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function AgentsTab() {
  const { agents, reload } = useAgents()
  const [selected, setSelected] = useState<Agent | null>(null)

  async function killAgent(id: number) {
    await fetch('/api/agents', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    reload()
    if (selected?.id === id) setSelected(null)
  }

  const running = agents.filter(a => a.status === 'running')
  const idle = agents.filter(a => a.status !== 'running')

  return (
    <div className="flex h-full">
      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-5">
        {running.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="text-[10px] text-slate-600 uppercase tracking-widest">Running</div>
              <div className="text-[10px] text-slate-800">{running.length}</div>
              <div className="flex-1 h-px bg-slate-800/50" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {running.map(a => (
                <AgentBlock key={a.id} agent={a} onClick={() => setSelected(a)} />
              ))}
            </div>
          </div>
        )}
        {idle.length > 0 && (
          <details className="group" open={running.length === 0}>
            <summary className="flex items-center gap-2 mb-3 cursor-pointer list-none select-none">
              <span className="text-[10px] text-slate-700 group-open:hidden">▶</span>
              <span className="text-[10px] text-slate-700 hidden group-open:inline">▼</span>
              <div className="text-[10px] text-slate-700 uppercase tracking-widest">Idle · {idle.length}</div>
              <div className="flex-1 h-px bg-slate-800/30" />
            </summary>
            <div className="grid grid-cols-3 gap-3">
              {idle.map(a => (
                <AgentBlock key={a.id} agent={a} onClick={() => setSelected(a)} />
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-80 shrink-0">
          <AgentDetailPanel
            agent={agents.find(a => a.id === selected.id) ?? selected}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 — ORCHESTRATOR CHAT (with left agent list)
// ═══════════════════════════════════════════════════════════════════════════════

type AgentOverview = {
  id: number; name: string; type: string; status: string; stage: string
  plan: string; risks: string; notes: string
  project: { id: number; name: string } | null
  tasks: { total: number; open: number; done: number; blocked: number; items: { title: string; status: string; priority: string }[] }
}

function isAgentOverviewArray(data: unknown): data is AgentOverview[] {
  return Array.isArray(data) && data.length > 0 &&
    typeof (data[0] as Record<string, unknown>).stage !== 'undefined' &&
    typeof (data[0] as Record<string, unknown>).tasks === 'object'
}

function TaskProgressBar({ tasks }: { tasks: AgentOverview['tasks'] }) {
  if (tasks.total === 0) return <span className="text-[10px] text-slate-800">no tasks</span>
  const pct = Math.round((tasks.done / tasks.total) * 100)
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className="text-[10px] text-slate-600">{tasks.open} open · {tasks.done} done</span>
        <span className="text-[10px] text-slate-700">{pct}%</span>
      </div>
      <div className="h-0.5 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-violet-600 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      {tasks.items.slice(0, 2).map((t, i) => (
        <div key={i} className="flex items-center gap-1 text-[10px] text-slate-700">
          <span className={t.status === 'blocked' ? 'text-red-700' : ''}>
            {t.status === 'blocked' ? '!' : '·'}
          </span>
          <span className="truncate">{t.title}</span>
        </div>
      ))}
    </div>
  )
}

function AgentOverviewCard({ a }: { a: AgentOverview }) {
  const dot = TYPE_DOT[a.type] ?? TYPE_DOT.other
  const stageStyle = (a.stage && STAGE_STYLE[a.stage.toLowerCase()]) || ''
  const isRunning = a.status === 'running'
  const summary = (a.notes ?? '').split('\n').find(l => l.trim().length > 3 && !l.startsWith('/') && !l.startsWith('Now:'))
    ?? (a.notes ?? '').split('\n').find(l => l.startsWith('Now:'))?.replace(/^Now:\s*/, '')

  return (
    <div className={`rounded-xl border p-3.5 space-y-2.5 ${isRunning ? 'bg-slate-900 border-slate-700/60' : 'bg-slate-900/40 border-slate-800/30'}`}>
      <div className="flex items-start gap-2">
        <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${dot} ${isRunning ? 'animate-pulse' : 'opacity-30'}`} />
        <div className="flex-1 min-w-0">
          <div className={`text-[13px] font-semibold truncate ${isRunning ? 'text-white' : 'text-slate-500'}`}>{a.name}</div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {a.project && <span className="text-[10px] text-slate-700 bg-slate-800/60 rounded px-1.5 py-0.5">{a.project.name}</span>}
            {a.stage && <span className={`text-[9px] rounded border px-1 py-px ${stageStyle || 'text-slate-700 border-slate-800'}`}>{a.stage}</span>}
          </div>
        </div>
      </div>
      {summary && <p className="text-[11px] text-slate-500 line-clamp-2">{summary}</p>}
      {a.plan && (
        <div className="border-t border-slate-800/60 pt-2 text-[11px] text-slate-600 line-clamp-2">
          {a.plan.replace(/[#*`]/g, '').split('\n').find(l => l.trim()) ?? ''}
        </div>
      )}
      {a.risks && (
        <div className="flex items-center gap-1 text-[10px] text-amber-800">
          <span>⚠</span><span className="truncate">{a.risks.replace(/[#*`\-]/g, '').split('\n').find(l => l.trim()) ?? ''}</span>
        </div>
      )}
      {a.tasks.total > 0 && (
        <div className="border-t border-slate-800/60 pt-2"><TaskProgressBar tasks={a.tasks} /></div>
      )}
    </div>
  )
}

function AgentOverviewGrid({ data }: { data: AgentOverview[] }) {
  const running = data.filter(a => a.status === 'running')
  const idle = data.filter(a => a.status !== 'running')
  return (
    <div className="space-y-3 w-full">
      {running.length > 0 && <div className="grid grid-cols-2 gap-2">{running.map(a => <AgentOverviewCard key={a.id} a={a} />)}</div>}
      {idle.length > 0 && (
        <details className="group">
          <summary className="text-[10px] text-slate-700 hover:text-slate-500 cursor-pointer list-none flex items-center gap-1 select-none">
            <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
            {idle.length} idle
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2">{idle.map(a => <AgentOverviewCard key={a.id} a={a} />)}</div>
        </details>
      )}
    </div>
  )
}

function ToolResult({ tc }: { tc: ToolCall }) {
  const [open, setOpen] = useState(false)
  const done = tc.result !== undefined
  const icon = TOOL_ICONS[tc.name] ?? '·'
  const isOverview = (tc.name === 'get_project_overview' || tc.name === 'list_agents') && isAgentOverviewArray(tc.result)

  return (
    <div>
      <button
        onClick={() => done && !isOverview && setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 text-[10px] rounded px-2 py-0.5 font-mono transition-all ${
          done
            ? isOverview ? 'text-violet-500 bg-violet-900/20 border border-violet-800/40 cursor-default'
              : 'text-slate-500 hover:text-slate-300 bg-slate-800/60 cursor-pointer'
            : 'text-slate-700 bg-slate-800/30 cursor-default'
        }`}
      >
        <span>{icon}</span>
        <span>{tc.name.replace(/_/g, ' ')}</span>
        {done && !isOverview && <span className="text-slate-700">{open ? '▴' : '▾'}</span>}
      </button>
      {isOverview && done && <div className="mt-3"><AgentOverviewGrid data={tc.result as AgentOverview[]} /></div>}
      {open && done && !isOverview && (
        <pre className="mt-1 text-[10px] text-slate-500 bg-[#0d1117] border border-slate-800/80 rounded-lg p-3 max-h-52 overflow-auto whitespace-pre-wrap">
          {JSON.stringify(tc.result, null, 2)}
        </pre>
      )}
    </div>
  )
}

const MD: Record<string, React.ElementType> = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed text-slate-200">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic text-slate-300">{children}</em>,
  ul: ({ children }) => <ul className="mb-2 space-y-0.5 pl-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 space-y-0.5 pl-4 list-decimal marker:text-slate-700">{children}</ol>,
  li: ({ children }) => <li className="text-slate-300 flex gap-1.5 before:content-['·'] before:text-slate-700 before:shrink-0 list-none"><span>{children}</span></li>,
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) =>
    className
      ? <code className="block bg-slate-900 border border-slate-800 rounded-lg p-3 text-[11px] font-mono text-slate-300 overflow-auto my-2">{children}</code>
      : <code className="bg-slate-800 rounded px-1.5 py-0.5 text-[11px] font-mono text-slate-300">{children}</code>,
  h1: ({ children }) => <p className="font-semibold text-white text-sm mb-1">{children}</p>,
  h2: ({ children }) => <p className="font-semibold text-slate-200 mb-1">{children}</p>,
  h3: ({ children }) => <p className="font-medium text-slate-300 mb-0.5 text-[13px]">{children}</p>,
  hr: () => <hr className="border-slate-800 my-3" />,
}

function AssistantBubble({ msg, isLast, streaming }: { msg: ChatMessage; isLast: boolean; streaming: boolean }) {
  const busy = isLast && streaming
  const thinking = busy && !msg.content && (msg.toolCalls?.length ?? 0) === 0
  return (
    <div className="flex gap-3 items-start">
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-[9px] font-bold text-white">AI</span>
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        {(msg.toolCalls?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {msg.toolCalls!.filter(tc => !isAgentOverviewArray(tc.result) || (tc.name !== 'get_project_overview' && tc.name !== 'list_agents')).map((tc, j) => <ToolResult key={j} tc={tc} />)}
            </div>
            {msg.toolCalls!.filter(tc => (tc.name === 'get_project_overview' || tc.name === 'list_agents') && isAgentOverviewArray(tc.result)).map((tc, j) => <ToolResult key={`ov-${j}`} tc={tc} />)}
          </div>
        )}
        {msg.content && (
          <div className="text-[13px] leading-relaxed">
            <ReactMarkdown components={MD}>{msg.content}</ReactMarkdown>
            {busy && <span className="inline-block w-0.5 h-3.5 bg-slate-500 ml-0.5 animate-pulse align-middle rounded-full" />}
          </div>
        )}
        {thinking && (
          <div className="flex gap-1 items-center py-1">
            {[0,120,240].map(d => <span key={d} className="w-1.5 h-1.5 bg-slate-700 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function SideAgentCard({ agent, onMention, onKill }: { agent: Agent; onMention: (a: Agent) => void; onKill: (id: number) => void }) {
  const [confirmKill, setConfirmKill] = useState(false)
  const dot = TYPE_DOT[agent.type] ?? TYPE_DOT.other
  const isRunning = agent.status === 'running'
  const lines = (agent.notes ?? '').split('\n').filter(l => l.trim().length > 3)
  const summary = lines.find(l => !l.startsWith('/') && !l.startsWith('Now:') && !l.startsWith('Goal:'))
    ?? lines.find(l => l.startsWith('Now:'))?.replace(/^Now:\s*/, '')

  function handleKill(e: React.MouseEvent) {
    e.stopPropagation()
    if (confirmKill) onKill(agent.id)
    else { setConfirmKill(true); setTimeout(() => setConfirmKill(false), 3000) }
  }

  return (
    <div onClick={() => onMention(agent)}
      className={`group rounded-lg px-3 py-2.5 cursor-pointer transition-colors space-y-1 ${
        isRunning ? 'bg-slate-900 border border-slate-800 hover:border-slate-700' : 'bg-slate-900/30 border border-slate-800/30 hover:border-slate-800'
      }`}>
      <div className="flex items-center gap-2 min-w-0">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot} ${isRunning ? 'animate-pulse' : 'opacity-30'}`} />
        <span className={`text-xs font-medium truncate flex-1 ${isRunning ? 'text-white' : 'text-slate-600'}`}>{agent.name}</span>
        <button onClick={handleKill}
          className={`shrink-0 text-[9px] rounded px-1.5 py-0.5 transition-all opacity-0 group-hover:opacity-100 ${
            confirmKill ? 'text-red-300 bg-red-900/60 border border-red-700/60 opacity-100' : 'text-slate-600 hover:text-red-400 bg-slate-800'
          }`}>
          {confirmKill ? 'sure?' : '✕'}
        </button>
      </div>
      {agent.stage && <div className="pl-3.5">{stageBadge(agent.stage)}</div>}
      {summary && isRunning && !agent.stage && <p className="text-[11px] text-slate-600 leading-snug line-clamp-2 pl-3.5">{summary}</p>}
    </div>
  )
}

function OrchestratorTab() {
  const { agents, reload } = useAgents()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  function mention(agent: Agent) {
    const tag = `@${agent.name} (id:${agent.id}) `
    setInput(prev => prev.trimEnd() ? `${prev.trimEnd()} ${tag}` : tag)
    textareaRef.current?.focus()
  }

  async function killAgent(id: number) {
    await fetch('/api/agents', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    reload()
  }

  async function send() {
    const text = input.trim()
    if (!text || streaming) return
    const userMsg: ChatMessage = { role: 'user', content: text }
    const history = [...messages, userMsg]
    setMessages(history); setInput(''); setStreaming(true)
    setMessages([...history, { role: 'assistant', content: '', toolCalls: [] }])
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })) }),
      })
      if (!res.body) throw new Error('No body')
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buf = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6))
            setMessages(prev => {
              const last = { ...prev[prev.length - 1] }
              if (ev.type === 'text') last.content = (last.content ?? '') + ev.delta
              else if (ev.type === 'tool_call') last.toolCalls = [...(last.toolCalls ?? []), { name: ev.name }]
              else if (ev.type === 'tool_result') {
                const calls = [...(last.toolCalls ?? [])]
                const idx = calls.findLastIndex((tc: ToolCall) => tc.name === ev.name && tc.result === undefined)
                if (idx >= 0) calls[idx] = { ...calls[idx], result: ev.result }
                last.toolCalls = calls
              }
              return [...prev.slice(0, -1), last]
            })
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      setMessages(prev => { const last = { ...prev[prev.length - 1], content: `Error: ${String(e)}` }; return [...prev.slice(0, -1), last] })
    } finally { setStreaming(false); textareaRef.current?.focus() }
  }

  const running = agents.filter(a => a.status === 'running')
  const idle = agents.filter(a => a.status !== 'running')
  const SUGGESTIONS = [
    'Show me everything all my agents are working on right now',
    'Find agents working on similar problems and share their memory',
    'What has any agent already figured out about auth or API design?',
  ]

  return (
    <div className="flex h-full">
      {/* Side agent list */}
      <div className="w-56 shrink-0 flex flex-col border-r border-slate-800/50">
        <div className="px-4 py-3 border-b border-slate-800/50 flex items-center justify-between shrink-0">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Agents</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-700">{running.length}/{agents.length}</span>
            {running.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {running.map(a => <SideAgentCard key={a.id} agent={a} onMention={mention} onKill={killAgent} />)}
          {idle.length > 0 && <>
            {running.length > 0 && <div className="text-[9px] text-slate-800 uppercase tracking-widest px-2 pt-3 pb-0.5">Idle · {idle.length}</div>}
            {idle.map(a => <SideAgentCard key={a.id} agent={a} onMention={mention} onKill={killAgent} />)}
          </>}
        </div>
      </div>

      {/* Chat */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="px-5 py-3 border-b border-slate-800/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center">
              <span className="text-[9px] font-bold text-white">AI</span>
            </div>
            <span className="text-[11px] font-semibold text-slate-300">Orchestrator</span>
            <span className="text-[10px] text-slate-700">gpt-4o</span>
          </div>
          {messages.length > 0 && <button onClick={() => setMessages([])} className="text-[10px] text-slate-700 hover:text-slate-400 transition-colors">clear</button>}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-6 -mt-8">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600/20 to-indigo-700/20 border border-violet-800/30 flex items-center justify-center">
                <span className="text-xl">⬡</span>
              </div>
              <div className="text-center">
                <p className="text-sm text-slate-500">What can I help you with?</p>
                <p className="text-[11px] text-slate-700 mt-0.5">Click an agent on the left to @ them</p>
              </div>
              <div className="flex flex-col gap-1.5 w-full max-w-xs">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => { setInput(s); setTimeout(() => textareaRef.current?.focus(), 0) }}
                    className="text-left text-[11px] text-slate-600 hover:text-slate-300 bg-slate-900/60 hover:bg-slate-900 border border-slate-800/40 hover:border-slate-700 rounded-lg px-3.5 py-2 transition-all">{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === 'user'
                ? <div className="flex justify-end"><div className="max-w-[75%] bg-slate-800 rounded-2xl rounded-tr-sm px-4 py-2.5 text-[13px] text-white leading-relaxed">{msg.content}</div></div>
                : <AssistantBubble msg={msg} isLast={i === messages.length - 1} streaming={streaming} />}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="px-4 pb-4 pt-2 shrink-0 border-t border-slate-800/50">
          <div className={`flex items-end gap-2 rounded-xl border px-3.5 py-2.5 transition-all ${
            streaming ? 'bg-slate-900/50 border-slate-800/50' : 'bg-slate-900 border-slate-700/50 focus-within:border-slate-500/80'
          }`}>
            <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={streaming ? 'Working…' : 'Ask about your agents… or click one to @ them'}
              rows={1} disabled={streaming}
              className="flex-1 bg-transparent text-[13px] text-white placeholder-slate-700 resize-none outline-none max-h-32 disabled:opacity-30 leading-relaxed py-0.5"
              style={{ fieldSizing: 'content' } as React.CSSProperties} />
            <button onClick={send} disabled={!input.trim() || streaming}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors mb-0.5">
              <span className="text-[11px] text-white font-bold">↑</span>
            </button>
          </div>
          <div className="text-[9px] text-slate-800 mt-1 px-1">Shift+Enter for newline</div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT — Tab shell
// ═══════════════════════════════════════════════════════════════════════════════

export default function Home() {
  const [tab, setTab] = useState<'agents' | 'orchestrator'>('agents')

  return (
    <div className="flex flex-col h-screen bg-[#080c12]">
      {/* Top tab bar */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-slate-800/60 shrink-0">
        {([
          { key: 'agents', label: 'Agents' },
          { key: 'orchestrator', label: 'Orchestrator' },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-3.5 py-2 text-[11px] font-medium rounded-t-lg border-b-2 transition-colors ${
              tab === key
                ? 'text-white border-violet-500 bg-slate-900/40'
                : 'text-slate-600 border-transparent hover:text-slate-400'
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        {tab === 'agents' ? <AgentsTab /> : <OrchestratorTab />}
      </div>
    </div>
  )
}
