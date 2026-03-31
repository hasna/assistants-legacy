import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export function GET() {
  try {
    const db = getDb()
    const rows = db.prepare("SELECT * FROM people ORDER BY updated_at DESC LIMIT 500").all()
    return NextResponse.json(rows)
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(req: Request) {
  try {
    const db = getDb()
    const body = await req.json()
    const id = crypto.randomUUID()
    const now = Date.now()
    db.prepare(
      "INSERT INTO people (id, name, email, phone, role, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(id, body.name, body.email, body.phone, body.role, body.notes, now, now)
    return NextResponse.json({ success: true, id })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
