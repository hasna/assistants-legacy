import { getDb } from "@/lib/db"
import { ChannelsClient } from "./client"

export interface ChannelRow {
  id: string
  name: string
  description: string | null
  created_by: string
  created_by_name: string
  status: string
  created_at: string
  updated_at: string
}

export default function ChannelsPage() {
  let data: ChannelRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT id, name, description, created_by, created_by_name, status, created_at, updated_at FROM channels ORDER BY created_at DESC LIMIT 500"
      )
      .all() as ChannelRow[]
  } catch {
    /* table may not exist */
  }
  return <ChannelsClient data={data} />
}
