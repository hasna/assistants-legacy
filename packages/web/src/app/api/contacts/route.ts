import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export function GET() {
  try {
    const db = getDb()
    const rows = db.prepare("SELECT * FROM contacts ORDER BY updated_at DESC LIMIT 500").all()
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
      "INSERT INTO contacts (id, name, email, phone, company, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(id, body.name, body.email, body.phone, body.company, body.notes, now, now)
    return NextResponse.json({ success: true, id })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
