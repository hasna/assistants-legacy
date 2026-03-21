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
    const body = await request.json();
    const label = typeof body.label === 'string' ? body.label.slice(0, 200) : null;
    const cwd = typeof body.cwd === 'string' ? body.cwd : process.cwd();

    const db = getDb();
    const id = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    db.prepare(`
      INSERT INTO persisted_sessions (id, cwd, started_at, updated_at, status, label)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(id, cwd, now, now, label);

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
    const body = await request.json();
    const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown) => typeof id === 'string') : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: 'ids required (array of strings)' }, { status: 400 });
    }
    const db = getDb();
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM persisted_sessions WHERE id IN (${placeholders})`).run(...ids);
    return NextResponse.json({ ok: true, deleted: ids.length });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete sessions' }, { status: 500 });
  }
}
