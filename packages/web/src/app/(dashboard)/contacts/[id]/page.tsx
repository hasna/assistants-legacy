import { notFound } from "next/navigation"
import { ContactDetailClient } from "./client"

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let data = null
  try {
    const { Database } = require("bun:sqlite") as typeof import("bun:sqlite")
    const { join } = require("path") as typeof import("path")
    const { homedir } = require("os") as typeof import("os")
    const { existsSync } = require("fs") as typeof import("fs")

    const dbPath = process.env.CONTACTS_DB_PATH ?? join(homedir(), ".contacts", "contacts.db")
    if (existsSync(dbPath)) {
      const db = new Database(dbPath, { readonly: true })
      data = db.prepare(`
        SELECT
          c.*,
          e.address AS primary_email,
          p.number AS primary_phone,
          co.name AS company_name
        FROM contacts c
        LEFT JOIN emails e ON e.contact_id = c.id AND e.is_primary = 1
        LEFT JOIN phones p ON p.contact_id = c.id AND p.is_primary = 1
        LEFT JOIN companies co ON co.id = c.company_id
        WHERE c.id = ?
      `).get(id)
      db.close()
    }
  } catch {
    /* DB not yet created or inaccessible */
  }

  if (!data) notFound()

  return <ContactDetailClient data={data as any} />
}
