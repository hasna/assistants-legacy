import { getDb } from "@/lib/db"
import { WorkspaceClient } from "./client"

export interface WorkspaceRow {
  id: string
  name: string
  description: string | null
  creator_id: string
  creator_name: string
  status: string
  participants: string | null
  created_at: string
  updated_at: string
}

export default function WorkspacePage() {
  let data: WorkspaceRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT id, name, description, creator_id, creator_name, status, participants, created_at, updated_at FROM workspaces ORDER BY updated_at DESC LIMIT 500"
      )
      .all() as WorkspaceRow[]
  } catch {
    /* table may not exist */
  }
  return <WorkspaceClient data={data} />
}
