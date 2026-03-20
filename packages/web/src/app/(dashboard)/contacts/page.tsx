/**
 * Contacts page — reads from @hasna/contacts database (~/.contacts/contacts.db)
 */
import { ContactsClient } from "./client"

export interface ContactRow {
  id: string
  display_name: string
  first_name: string | null
  last_name: string | null
  job_title: string | null
  primary_email: string | null
  primary_phone: string | null
  company_name: string | null
  notes: string | null
  status: string
  archived: number
  created_at: string
  updated_at: string
}

export interface CompanyRow {
  id: string
  name: string
  domain: string | null
  industry: string | null
  notes: string | null
  created_at: string
}

export default function ContactsPage() {
  let contacts: ContactRow[] = []
  let companies: CompanyRow[] = []

  try {
    const { Database } = require("bun:sqlite") as typeof import("bun:sqlite")
    const { join } = require("path") as typeof import("path")
    const { homedir } = require("os") as typeof import("os")
    const { existsSync } = require("fs") as typeof import("fs")

    const dbPath = process.env.CONTACTS_DB_PATH ?? join(homedir(), ".contacts", "contacts.db")
    if (existsSync(dbPath)) {
      const db = new Database(dbPath, { readonly: true })

      // Contacts with primary email, phone, and company name
      contacts = db.prepare(`
        SELECT
          c.id,
          c.display_name,
          c.first_name,
          c.last_name,
          c.job_title,
          c.status,
          c.archived,
          c.notes,
          c.created_at,
          c.updated_at,
          e.address AS primary_email,
          p.number AS primary_phone,
          co.name AS company_name
        FROM contacts c
        LEFT JOIN emails e ON e.contact_id = c.id AND e.is_primary = 1
        LEFT JOIN phones p ON p.contact_id = c.id AND p.is_primary = 1
        LEFT JOIN companies co ON co.id = c.company_id
        WHERE c.archived = 0
        ORDER BY c.display_name ASC
        LIMIT 500
      `).all() as ContactRow[]

      // Companies
      companies = db.prepare(`
        SELECT id, name, domain, industry, notes, created_at
        FROM companies
        WHERE archived = 0
        ORDER BY name ASC
        LIMIT 200
      `).all() as CompanyRow[]

      db.close()
    }
  } catch {
    /* DB not yet created or inaccessible */
  }

  return <ContactsClient contacts={contacts} companies={companies} />
}
