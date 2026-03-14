import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json() as { value?: string; importance?: number; category?: string; summary?: string }
    const db = getDb()
    const now = new Date().toISOString()
    const fields: string[] = []
    const values: unknown[] = []

    if (body.value !== undefined) { fields.push('value = ?'); values.push(body.value) }
    if (body.importance !== undefined) { fields.push('importance = ?'); values.push(body.importance) }
    if (body.category !== undefined) { fields.push('category = ?'); values.push(body.category) }
    if (body.summary !== undefined) { fields.push('summary = ?'); values.push(body.summary) }
    fields.push('updated_at = ?'); values.push(now)
    values.push(id)

    db.prepare(`UPDATE memories SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    getDb().prepare('DELETE FROM memories WHERE id = ?').run(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
