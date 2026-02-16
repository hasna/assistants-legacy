import { getDb } from "@/lib/db"
import { TasksClient, type TaskRow } from "./client"

export default function TasksPage() {
  let data: TaskRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 500")
      .all() as TaskRow[]
  } catch {
    /* table may not exist */
  }
  return <TasksClient data={data} />
}
