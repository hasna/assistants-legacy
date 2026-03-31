import { getDb } from "@/lib/db"
import { RecordingsClient, type RecordingRow } from "./client"

export default function RecordingsPage() {
  let data: RecordingRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare("SELECT * FROM recordings ORDER BY created_at DESC LIMIT 500")
      .all() as RecordingRow[]
  } catch {
    /* table may not exist */
  }
  return <RecordingsClient data={data} />
}
