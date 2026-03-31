import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

function safeCount(db: ReturnType<typeof getDb>, sql: string): number {
  try {
    return (db.prepare(sql).get() as { c: number })?.c ?? 0
  } catch {
    return 0
  }
}

export function GET() {
  try {
    const db = getDb()
    return NextResponse.json({
      tasks: safeCount(db, "SELECT COUNT(*) as c FROM tasks WHERE status = 'pending'"),
      sessions: safeCount(db, "SELECT COUNT(*) as c FROM persisted_sessions WHERE status = 'active'"),
      memories: safeCount(db, "SELECT COUNT(*) as c FROM memories"),
      schedules: safeCount(db, "SELECT COUNT(*) as c FROM schedules WHERE status = 'active'"),
    })
  } catch {
    return NextResponse.json({ tasks: 0, sessions: 0, memories: 0, schedules: 0 })
  }
}
