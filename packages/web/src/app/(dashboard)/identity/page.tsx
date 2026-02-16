import { getDb } from "@/lib/db"
import { IdentityClient } from "./client"

export interface IdentityRow {
  scope: string
  scope_id: string | null
  key: string
  value: string
  updated_at: string
}

export default function IdentityPage() {
  let data: IdentityRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT scope, scope_id, key, value, updated_at FROM config WHERE scope = 'identity' OR key LIKE '%identity%' ORDER BY updated_at DESC LIMIT 500"
      )
      .all() as IdentityRow[]
  } catch {
    /* table may not exist */
  }
  return <IdentityClient data={data} />
}
