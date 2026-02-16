import { getDb } from "@/lib/db"
import { ConnectorsClient } from "./client"

export interface ConnectorRow {
  key: string
  data: string
  cached_at: string
}

export default function ConnectorsPage() {
  let data: ConnectorRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT key, data, cached_at FROM connector_cache ORDER BY cached_at DESC LIMIT 500"
      )
      .all() as ConnectorRow[]
  } catch {
    /* table may not exist */
  }
  return <ConnectorsClient data={data} />
}
