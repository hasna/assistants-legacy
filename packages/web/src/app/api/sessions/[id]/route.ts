import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const db = getDb()
    const body = await req.json()

    if (body.label !== undefined) {
      db.prepare("UPDATE persisted_sessions SET label = ?, updated_at = ? WHERE id = ?").run(
        body.label,
        Date.now(),
        id
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const db = getDb()
    db.prepare("DELETE FROM session_messages WHERE session_id = ?").run(id)
    db.prepare("DELETE FROM persisted_sessions WHERE id = ?").run(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    )
  }
}
