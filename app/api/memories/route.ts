import { NextRequest, NextResponse } from 'next/server'
import { xtrace } from '@/lib/xtrace'

export async function GET(req: NextRequest) {
  if (!process.env.XTRACE_API_KEY || process.env.XTRACE_API_KEY.startsWith('xtk_your')) {
    return NextResponse.json({ memories: [], configured: false })
  }

  const { searchParams } = req.nextUrl
  const agentId = searchParams.get('agentId')
  const query = searchParams.get('query') ?? ''
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50)

  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  try {
    if (query.trim()) {
      const results = await xtrace.memories.search({
        query,
        filters: { user_id: agentId },
        limit,
      })
      return NextResponse.json({ memories: results.data ?? [], configured: true })
    } else {
      const iter = xtrace.memories.list({ user_id: agentId, limit })
      const collected: unknown[] = []
      for await (const memory of iter) {
        collected.push(memory)
        if (collected.length >= limit) break
      }
      return NextResponse.json({ memories: collected, configured: true })
    }
  } catch (err) {
    console.error('[xtrace] memories fetch failed:', err)
    return NextResponse.json({ memories: [], configured: true, error: String(err) })
  }
}
