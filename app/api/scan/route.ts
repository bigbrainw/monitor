import { execSync } from 'child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import path from 'path'
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { agents } from '@/db/schema'
import { eq, and, isNotNull } from 'drizzle-orm'
import { ingestClaudeSession } from '@/lib/ingest'

type AgentType = 'claude' | 'codex' | 'cursor' | 'gemini'

const RULES: {
  type: AgentType
  name: string
  match: (cmd: string) => boolean
  dedup?: boolean
}[] = [
  {
    type: 'claude',
    name: 'Claude Code',
    match: cmd => /^claude(\s|$)/.test(cmd) || /\/bin\/claude(\s|$)/.test(cmd),
  },
  {
    type: 'gemini',
    name: 'Gemini CLI',
    match: cmd => /\bgemini\b/.test(cmd) && !cmd.includes('grep'),
  },
  {
    type: 'codex',
    name: 'Codex',
    match: cmd => /\/Codex\.app\/Contents\/MacOS\/Codex$/.test(cmd),
    dedup: true,
  },
  {
    type: 'codex',
    name: 'Codex CLI',
    match: cmd => /\bcodex\b/.test(cmd) && !cmd.includes('/Applications/Codex.app') &&
                  !cmd.includes('Helper') && !cmd.includes('Sparkle') && !cmd.includes('Updater'),
  },
  {
    type: 'cursor',
    name: 'Cursor',
    match: cmd => /\/Cursor\.app\/Contents\/MacOS\/Cursor$/.test(cmd),
    dedup: true,
  },
]

type DetectedProcess = {
  pid: number
  type: AgentType
  name: string
  command: string
  cwd?: string
  summary?: string
  lastActivity?: number
  jsonlPath?: string
  sessionId?: string
}

function getProcesses(): Map<number, string> {
  let output: string
  try { output = execSync('ps -eo pid,command', { encoding: 'utf8', timeout: 5000 }) }
  catch { return new Map() }

  const map = new Map<number, string>()
  for (const line of output.split('\n').slice(1)) {
    const m = line.trim().match(/^(\d+)\s+(.+)/)
    if (!m) continue
    map.set(parseInt(m[1], 10), m[2])
  }
  return map
}

function getCwds(pids: number[]): Map<number, string> {
  if (pids.length === 0) return new Map()
  const map = new Map<number, string>()
  try {
    const pidStr = pids.join(',')
    const out = execSync(`lsof -p ${pidStr} 2>/dev/null | awk '/cwd/ {print $2, $NF}'`, {
      encoding: 'utf8', timeout: 8000,
    })
    for (const line of out.split('\n')) {
      const parts = line.trim().split(' ')
      if (parts.length >= 2) {
        const pid = parseInt(parts[0], 10)
        const cwd = parts[parts.length - 1]
        if (!isNaN(pid) && cwd.startsWith('/') && !map.has(pid)) {
          map.set(pid, cwd)
        }
      }
    }
  } catch { /* ignore */ }
  return map
}

function cwdToClaudeProjectKey(cwd: string): string {
  return cwd.replace(/\//g, '-')
}

function getClaudeInfo(cwd: string, command: string): {
  summary?: string
  lastActivity?: number
  jsonlPath?: string
  sessionId?: string
} {
  const home = homedir()
  const projectsDir = path.join(home, '.claude', 'projects')
  const resumeMatch = command.match(/--resume\s+([a-f0-9-]{36})/)
  const sessionId = resumeMatch?.[1]
  const key = cwdToClaudeProjectKey(cwd)
  const projectDir = path.join(projectsDir, key)

  let jsonlPath: string | undefined
  let lastActivity: number | undefined
  let resolvedSessionId: string | undefined

  if (sessionId) {
    const candidate = path.join(projectDir, `${sessionId}.jsonl`)
    if (existsSync(candidate)) {
      jsonlPath = candidate
      lastActivity = statSync(candidate).mtimeMs
      resolvedSessionId = sessionId
    }
  }

  if (!jsonlPath && existsSync(projectDir)) {
    try {
      const files = readdirSync(projectDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => { const p = path.join(projectDir, f); return { p, mtime: statSync(p).mtimeMs, name: f } })
        .sort((a, b) => b.mtime - a.mtime)
      if (files[0]) {
        jsonlPath = files[0].p
        lastActivity = files[0].mtime
        resolvedSessionId = files[0].name.replace('.jsonl', '')
      }
    } catch { /* ignore */ }
  }

  if (!jsonlPath) return { lastActivity }

  try {
    const lines = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean)

    function extractText(d: Record<string, unknown>): string {
      const msg = (d.message ?? d) as Record<string, unknown>
      const content = msg.content ?? ''
      if (typeof content === 'string') return content.trim()
      if (Array.isArray(content)) {
        return (content as { type: string; text?: string }[])
          .filter(c => c.type === 'text').map(c => c.text ?? '').join(' ').trim()
      }
      return ''
    }

    const userMsgs: string[] = []
    for (const line of lines) {
      try {
        const d = JSON.parse(line) as Record<string, unknown>
        if (d.type !== 'user') continue
        const text = extractText(d)
        if (text.length > 10 && !text.startsWith('<')) userMsgs.push(text)
      } catch { /* skip */ }
    }

    if (userMsgs.length === 0) return { lastActivity, jsonlPath, sessionId: resolvedSessionId }
    const last = userMsgs[userMsgs.length - 1].slice(0, 200)
    const first = userMsgs[0].slice(0, 100)
    const summary = (userMsgs.length === 1 || last === first)
      ? last
      : `Now: ${last}\nGoal: ${first}`
    return { summary, lastActivity, jsonlPath, sessionId: resolvedSessionId }
  } catch { /* ignore */ }

  return { lastActivity, jsonlPath, sessionId: resolvedSessionId }
}

function getProjectSummary(cwd: string): string | undefined {
  for (const fname of ['CLAUDE.md', 'README.md']) {
    const fpath = path.join(cwd, fname)
    if (!existsSync(fpath)) continue
    try {
      const text = readFileSync(fpath, 'utf8').trim()
      if (text.length < 10) continue
      for (const line of text.split('\n')) {
        const stripped = line.replace(/^#+\s*/, '').trim()
        if (stripped.length > 10) return stripped.slice(0, 180)
      }
    } catch { /* ignore */ }
  }
  return undefined
}

function scanProcesses(): DetectedProcess[] {
  const cmdMap = getProcesses()
  const found: DetectedProcess[] = []
  const dedupSeen = new Set<string>()

  for (const [pid, command] of cmdMap) {
    for (const rule of RULES) {
      if (!rule.match(command)) continue
      const dedupKey = `${rule.type}:${rule.name}`
      if (rule.dedup) {
        if (dedupSeen.has(dedupKey)) break
        dedupSeen.add(dedupKey)
      }
      found.push({ pid, type: rule.type, name: rule.name, command: command.slice(0, 120) })
      break
    }
  }

  if (found.length === 0) return found

  const cwdMap = getCwds(found.map(p => p.pid))

  for (const proc of found) {
    const cwd = cwdMap.get(proc.pid)
    if (cwd) {
      proc.cwd = cwd
      if (proc.type === 'claude') {
        const info = getClaudeInfo(cwd, proc.command)
        proc.summary = info.summary
        proc.lastActivity = info.lastActivity
        proc.jsonlPath = info.jsonlPath
        proc.sessionId = info.sessionId
      }
      if (!proc.summary) proc.summary = getProjectSummary(cwd)
      if (!proc.summary) proc.summary = path.basename(cwd)
      if (!proc.lastActivity) proc.lastActivity = Date.now()
    }
  }

  return found.sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0))
}

export async function GET() {
  const detected = scanProcesses()
  const detectedPids = new Set(detected.map(p => p.pid))

  for (const proc of detected) {
    const existing = await db.query.agents.findFirst({
      where: and(eq(agents.pid, proc.pid), eq(agents.autoDetected, true)),
    })

    const notesText = [proc.cwd, proc.summary].filter(Boolean).join('\n')

    let agentId: number

    if (existing) {
      await db.update(agents)
        .set({ status: 'running', notes: notesText, updatedAt: new Date().toISOString() })
        .where(eq(agents.id, existing.id))
      agentId = existing.id
    } else {
      const [inserted] = await db.insert(agents).values({
        name: proc.name,
        type: proc.type,
        status: 'running',
        pid: proc.pid,
        autoDetected: true,
        notes: notesText,
      }).returning({ id: agents.id })
      agentId = inserted.id
    }

    // Fire-and-forget ingestion for Claude sessions
    if (proc.type === 'claude' && proc.jsonlPath && proc.sessionId && proc.cwd) {
      void ingestClaudeSession(proc.jsonlPath, proc.sessionId, agentId, proc.cwd)
    }
  }

  const runningAutoAgents = await db.query.agents.findMany({
    where: and(eq(agents.autoDetected, true), eq(agents.status, 'running'), isNotNull(agents.pid)),
  })

  for (const agent of runningAutoAgents) {
    if (agent.pid && !detectedPids.has(agent.pid)) {
      await db.update(agents)
        .set({ status: 'idle', pid: null, updatedAt: new Date().toISOString() })
        .where(eq(agents.id, agent.id))
    }
  }

  return NextResponse.json({ detected, count: detected.length })
}
