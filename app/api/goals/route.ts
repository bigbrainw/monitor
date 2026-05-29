import { db } from '@/db'
import { goals } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const rows = await db.query.goals.findMany({
    orderBy: (g, { desc }) => [desc(g.createdAt)],
  })
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const [row] = await db.insert(goals).values(body).returning()
  return NextResponse.json(row, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...data } = body
  data.updatedAt = new Date().toISOString()
  const [row] = await db.update(goals).set(data).where(eq(goals.id, id)).returning()
  return NextResponse.json(row)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await db.delete(goals).where(eq(goals.id, id))
  return NextResponse.json({ ok: true })
}
