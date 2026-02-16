import { getDb } from "@/lib/db"
import { JobsClient, type JobRow } from "./client"

export default function JobsPage() {
  let data: JobRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 500")
      .all() as JobRow[]
  } catch {
    /* table may not exist */
  }
  return <JobsClient data={data} />
}
