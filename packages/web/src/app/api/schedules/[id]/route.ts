import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { action } = await req.json() as { action: 'pause' | 'resume' | 'delete' }
    const db = getDb()
    const { id } = await params

    if (action === 'pause') {
      db.prepare("UPDATE schedules SET status = 'paused' WHERE id = ?").run(id)
      return NextResponse.json({ ok: true, status: 'paused' })
    }
    if (action === 'resume') {
      db.prepare("UPDATE schedules SET status = 'active' WHERE id = ?").run(id)
      return NextResponse.json({ ok: true, status: 'active' })
    }
    if (action === 'delete') {
      db.prepare("DELETE FROM schedules WHERE id = ?").run(id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
