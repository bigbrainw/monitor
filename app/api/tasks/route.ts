import { db } from '@/db'
import { tasks } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { ingestTaskEvent } from '@/lib/ingest'

export async function GET() {
  const rows = await db.query.tasks.findMany({
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  })
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const [row] = await db.insert(tasks).values(body).returning()

  if (row.agentId) {
    void ingestTaskEvent(row.agentId, row.title, row.status)
  }

  return NextResponse.json(row, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...data } = body
  data.updatedAt = new Date().toISOString()
  const [row] = await db.update(tasks).set(data).where(eq(tasks.id, id)).returning()

  if (row.agentId && data.status) {
    void ingestTaskEvent(row.agentId, row.title, row.status)
  }

  return NextResponse.json(row)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await db.delete(tasks).where(eq(tasks.id, id))
  return NextResponse.json({ ok: true })
}
