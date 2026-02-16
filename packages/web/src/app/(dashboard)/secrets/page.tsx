import { getDb } from "@/lib/db"
import { SecretsClient } from "./client"

export interface SecretRow {
  name: string
  scope: string
  assistant_id: string | null
  description: string | null
  created_at: string
  updated_at: string
}

export default function SecretsPage() {
  let data: SecretRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT name, scope, assistant_id, description, created_at, updated_at FROM secrets ORDER BY updated_at DESC LIMIT 500"
      )
      .all() as SecretRow[]
  } catch {
    /* table may not exist */
  }
  return <SecretsClient data={data} />
}
