import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: Request) {
  const body = await req.json() as { id?: string }
  if (!body.id) {
    return NextResponse.json({ error: 'Hook ID required' }, { status: 400 })
  }

  try {
    const db = getDb()
    db.prepare('DELETE FROM hooks WHERE id = ?').run(body.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
