import { getDb } from "@/lib/db"
import { ContactsClient } from "./client"

export interface ContactRow {
  id: string
  name: string
  company: string | null
  title: string | null
  birthday: string | null
  relationship: string | null
  notes: string | null
  favorite: number
  created_at: string
  updated_at: string
}

export default function ContactsPage() {
  let data: ContactRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT id, name, company, title, birthday, relationship, notes, favorite, created_at, updated_at FROM contacts ORDER BY name ASC LIMIT 500"
      )
      .all() as ContactRow[]
  } catch {
    /* table may not exist */
  }
  return <ContactsClient data={data} />
}
