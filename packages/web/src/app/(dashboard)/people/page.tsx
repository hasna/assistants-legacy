import { getDb } from "@/lib/db"
import { PeopleClient } from "./client"

export interface PersonRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string | null
  notes: string | null
  avatar_url: string | null
  metadata: string | null
  created_at: string
  updated_at: string
}

export default function PeoplePage() {
  let data: PersonRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT id, name, email, phone, role, notes, avatar_url, metadata, created_at, updated_at FROM people ORDER BY name ASC LIMIT 500"
      )
      .all() as PersonRow[]
  } catch {
    /* table may not exist */
  }
  return <PeopleClient data={data} />
}
