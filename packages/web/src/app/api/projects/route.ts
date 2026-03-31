import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export function GET() {
  try {
    const db = getDb()
    const rows = db.prepare("SELECT * FROM projects ORDER BY updated_at DESC LIMIT 500").all()
    return NextResponse.json(rows)
  } catch {
    return NextResponse.json([])
  }
}
