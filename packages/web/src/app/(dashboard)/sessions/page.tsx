import { getDb } from "@/lib/db"
import { SessionsClient, type SessionRow } from "./client"

export default function SessionsPage() {
  let data: SessionRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        `SELECT s.id, s.cwd, s.started_at, s.updated_at, s.label, s.status,
          (SELECT COUNT(*) FROM session_messages sm WHERE sm.session_id = s.id) as message_count
         FROM persisted_sessions s ORDER BY s.updated_at DESC LIMIT 500`
      )
      .all() as SessionRow[]
  } catch {
    /* table may not exist */
  }
  return <SessionsClient data={data} />
}
