import { NextResponse } from 'next/server';
import { getSessions, getDb } from '@/lib/db';

export async function GET() {
  try {
    const sessions = getSessions(100);

    // Group by date
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);

    const grouped = {
      today: sessions.filter(s => s.updated_at >= today.getTime()),
      yesterday: sessions.filter(s => s.updated_at >= yesterday.getTime() && s.updated_at < today.getTime()),
      thisWeek: sessions.filter(s => s.updated_at >= weekAgo.getTime() && s.updated_at < yesterday.getTime()),
      older: sessions.filter(s => s.updated_at < weekAgo.getTime()),
    };

    return NextResponse.json({ sessions, grouped });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { label, cwd } = await request.json();
    const db = getDb();
    const id = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    db.prepare(`
      INSERT INTO persisted_sessions (id, cwd, started_at, updated_at, status, label)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(id, cwd || process.cwd(), now, now, label || null);

    return NextResponse.json({ id, status: 'created' });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { ids } = await request.json() as { ids: string[] }
    if (!ids?.length) return NextResponse.json({ error: 'ids required' }, { status: 400 })
    const db = getDb()
    const placeholders = ids.map(() => '?').join(',')
    db.prepare(`DELETE FROM persisted_sessions WHERE id IN (${placeholders})`).run(...ids)
    return NextResponse.json({ ok: true, deleted: ids.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
