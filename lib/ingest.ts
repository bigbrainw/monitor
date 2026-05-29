import { readFileSync } from 'fs'
import { db } from '@/db'
import { memorySync, agents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { xtrace } from './xtrace'

type Role = 'user' | 'assistant'

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

export async function ingestClaudeSession(
  jsonlPath: string,
  sessionId: string,
  agentId: number,
  cwd: string,
) {
  if (!process.env.XTRACE_API_KEY || process.env.XTRACE_API_KEY.startsWith('xtk_your')) return

  let lines: string[]
  try {
    lines = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean)
  } catch { return }

  const existing = db.select().from(memorySync).where(eq(memorySync.source, jsonlPath)).get() as
    { id: number; lastLineCount: number } | undefined

  const alreadyIngested = existing?.lastLineCount ?? 0
  const newLines = lines.slice(alreadyIngested)
  if (newLines.length === 0) return

  const messages: { role: Role; content: string }[] = []
  for (const line of newLines) {
    try {
      const d = JSON.parse(line) as Record<string, unknown>
      const role = d.type === 'user' ? 'user' : d.type === 'assistant' ? 'assistant' : null
      if (!role) continue
      const text = extractText(d)
      if (text.length > 10 && !text.startsWith('<')) {
        messages.push({ role, content: text.slice(0, 2000) })
      }
    } catch { /* skip */ }
  }

  if (messages.length === 0) {
    db.insert(memorySync).values({
      source: jsonlPath,
      lastLineCount: lines.length,
      lastIngestedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: memorySync.source,
      set: { lastLineCount: lines.length, lastIngestedAt: new Date().toISOString() },
    }).run()
    return
  }

  try {
    await xtrace.memories.ingest({
      messages,
      user_id: String(agentId),
      conv_id: sessionId,
      metadata: { agentType: 'claude', cwd, agentId },
    })

    db.insert(memorySync).values({
      source: jsonlPath,
      lastLineCount: lines.length,
      lastIngestedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: memorySync.source,
      set: { lastLineCount: lines.length, lastIngestedAt: new Date().toISOString() },
    }).run()
  } catch (err) {
    console.error('[xtrace] ingest failed:', err)
  }
}

export async function ingestTaskEvent(
  agentId: number,
  taskTitle: string,
  status: string,
) {
  if (!process.env.XTRACE_API_KEY || process.env.XTRACE_API_KEY.startsWith('xtk_your')) return

  // Look up agent type for metadata
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get() as
    { type: string; name: string } | undefined

  try {
    await xtrace.memories.ingest({
      messages: [
        { role: 'user', content: `Task: ${taskTitle}` },
        { role: 'assistant', content: `Status updated to: ${status}` },
      ],
      user_id: String(agentId),
      conv_id: `tasks-${agentId}`,
      metadata: { agentType: agent?.type ?? 'other', agentId, taskTitle, status },
    })
  } catch (err) {
    console.error('[xtrace] task ingest failed:', err)
  }
}
