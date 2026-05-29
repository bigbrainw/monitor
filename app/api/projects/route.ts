import { db } from '@/db'
import { projects } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const rows = await db.query.projects.findMany({
    orderBy: (p, { desc }) => [desc(p.updatedAt)],
    with: {
      agents: true,
      goals: true,
      tasks: true,
    },
  })
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const [row] = await db.insert(projects).values(body).returning()
  return NextResponse.json(row, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...data } = body
  data.updatedAt = new Date().toISOString()
  const [row] = await db.update(projects).set(data).where(eq(projects.id, id)).returning()
  return NextResponse.json(row)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  await db.delete(projects).where(eq(projects.id, id))
  return NextResponse.json({ ok: true })
}
