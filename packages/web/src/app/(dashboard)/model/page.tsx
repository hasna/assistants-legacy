import { getDb } from "@/lib/db"
import { ModelClient, type ModelConfigRow } from "./client"

export default function ModelPage() {
  let data: ModelConfigRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT key, value, scope, scope_id, updated_at FROM config WHERE key LIKE '%model%' OR scope = 'model' ORDER BY updated_at DESC LIMIT 500"
      )
      .all() as ModelConfigRow[]
  } catch {
    /* table may not exist */
  }
  return <ModelClient data={data} />
}
