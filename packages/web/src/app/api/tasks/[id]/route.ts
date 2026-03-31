import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await req.json() as { status?: string; description?: string; priority?: string }
    const db = getDb()
    const { id } = await params
    const now = new Date().toISOString()

    const sets: string[] = []
    const vals: unknown[] = []

    if (body.status) {
      const valid = ['pending', 'in_progress', 'completed', 'failed', 'cancelled']
      if (!valid.includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      sets.push('status = ?')
      vals.push(body.status)
      sets.push('completed_at = ?')
      vals.push(body.status === 'completed' ? now : null)
    }

    if (body.description !== undefined) {
      sets.push('description = ?')
      vals.push(body.description.trim())
    }

    if (body.priority !== undefined) {
      sets.push('priority = ?')
      vals.push(body.priority)
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    sets.push('updated_at = ?')
    vals.push(now)
    vals.push(id)

    db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
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
    const db = getDb()
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
