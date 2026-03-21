import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { randomUUID } from 'crypto'

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      command: string
      scheduleType: 'interval' | 'cron' | 'once'
      intervalValue?: number
      intervalUnit?: string
      cronExpression?: string
      onceAt?: string
    }
    if (!body.command?.trim()) return NextResponse.json({ error: 'command required' }, { status: 400 })

    const validTypes = ['interval', 'cron', 'once'] as const;
    if (!validTypes.includes(body.scheduleType as typeof validTypes[number])) {
      return NextResponse.json({ error: 'scheduleType must be interval, cron, or once' }, { status: 400 });
    }

    // Build schedule JSON
    let schedule: Record<string, unknown>
    if (body.scheduleType === 'interval') {
      const interval = typeof body.intervalValue === 'number' && body.intervalValue > 0 ? body.intervalValue : 60;
      schedule = { kind: 'interval', interval, unit: body.intervalUnit ?? 'seconds' }
    } else if (body.scheduleType === 'cron') {
      if (!body.cronExpression) return NextResponse.json({ error: 'cron expression required' }, { status: 400 })
      schedule = { kind: 'cron', cron: body.cronExpression }
    } else {
      schedule = { kind: 'once', at: body.onceAt ?? new Date().toISOString() }
    }

    const db = getDb()
    const id = randomUUID().slice(0, 8)
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO schedules (id, project_path, command, schedule, status, run_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', 0, ?, ?)
    `).run(id, process.cwd(), body.command.trim(), JSON.stringify(schedule), now, now)

    return NextResponse.json({ ok: true, id })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create schedule' }, { status: 500 })
  }
}
