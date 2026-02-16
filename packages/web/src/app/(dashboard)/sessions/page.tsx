import { getDb } from "@/lib/db"
import { SessionsClient, type SessionRow } from "./client"

export default function SessionsPage() {
  let data: SessionRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT id, cwd, started_at, updated_at, label, status FROM persisted_sessions ORDER BY updated_at DESC LIMIT 500"
      )
      .all() as SessionRow[]
  } catch {
    /* table may not exist */
  }
  return <SessionsClient data={data} />
}
