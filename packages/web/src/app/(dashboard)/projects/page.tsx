import { getDb } from "@/lib/db"
import { ProjectsClient, type ProjectRow } from "./client"

export default function ProjectsPage() {
  let data: ProjectRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare("SELECT * FROM projects ORDER BY updated_at DESC LIMIT 500")
      .all() as ProjectRow[]
  } catch {
    /* table may not exist */
  }
  return <ProjectsClient data={data} />
}
