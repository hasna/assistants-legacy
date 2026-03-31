import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    const body = await req.json()
    const now = Date.now()
    const fields: string[] = []
    const values: unknown[] = []

    for (const key of ["name", "email", "phone", "company", "notes"]) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`)
        values.push(body[key])
      }
    }

    if (fields.length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 })
    }

    fields.push("updated_at = ?")
    values.push(now)
    values.push(id)

    db.prepare(`UPDATE contacts SET ${fields.join(", ")} WHERE id = ?`).run(...values)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()
    db.prepare("DELETE FROM contacts WHERE id = ?").run(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
