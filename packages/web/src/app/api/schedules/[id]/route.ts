import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await req.json() as { action: string };
    const action = body.action;
    const db = getDb();
    const { id } = await params;

    if (!['pause', 'resume', 'delete'].includes(action)) {
      return NextResponse.json({ error: 'action must be pause, resume, or delete' }, { status: 400 });
    }

    if (action === 'delete') {
      const result = db.prepare("DELETE FROM schedules WHERE id = ?").run(id);
      if (result.changes === 0) {
        return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }

    const newStatus = action === 'pause' ? 'paused' : 'active';
    const result = db.prepare("UPDATE schedules SET status = ? WHERE id = ?").run(newStatus, id);
    if (result.changes === 0) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, status: newStatus });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
  }
}
