'use client'

import { Badge } from '@/components/ui/badge'

const agentStatusConfig = {
  running: { label: 'Running', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  idle:    { label: 'Idle',    className: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
  done:    { label: 'Done',    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  blocked: { label: 'Blocked', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
}

const taskStatusConfig = {
  'todo':        { label: 'Todo',        className: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
  'in-progress': { label: 'In Progress', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  'done':        { label: 'Done',        className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  'blocked':     { label: 'Blocked',     className: 'bg-red-500/20 text-red-400 border-red-500/30' },
}

const agentTypeConfig = {
  claude:  { label: 'Claude',  className: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
  codex:   { label: 'Codex',   className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  cursor:  { label: 'Cursor',  className: 'bg-sky-500/20 text-sky-400 border-sky-500/30' },
  gemini:  { label: 'Gemini',  className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  other:   { label: 'Other',   className: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
}

export function AgentStatusBadge({ status }: { status: string }) {
  const cfg = agentStatusConfig[status as keyof typeof agentStatusConfig] ?? agentStatusConfig.idle
  return <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>
}

export function TaskStatusBadge({ status }: { status: string }) {
  const cfg = taskStatusConfig[status as keyof typeof taskStatusConfig] ?? taskStatusConfig.todo
  return <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>
}

export function AgentTypeBadge({ type }: { type: string }) {
  const cfg = agentTypeConfig[type as keyof typeof agentTypeConfig] ?? agentTypeConfig.other
  return <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>
}
