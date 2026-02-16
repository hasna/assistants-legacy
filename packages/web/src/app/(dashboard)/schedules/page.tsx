import { getDb } from "@/lib/db"
import { SchedulesClient, type ScheduleRow } from "./client"

export default function SchedulesPage() {
  let data: ScheduleRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare("SELECT * FROM schedules ORDER BY created_at DESC LIMIT 500")
      .all() as ScheduleRow[]
  } catch {
    /* table may not exist */
  }
  return <SchedulesClient data={data} />
}
