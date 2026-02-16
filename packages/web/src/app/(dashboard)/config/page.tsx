import { getDb } from "@/lib/db"
import { ConfigClient, type ConfigRow } from "./client"

export default function ConfigPage() {
  let data: ConfigRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare("SELECT * FROM config ORDER BY updated_at DESC LIMIT 500")
      .all() as ConfigRow[]
  } catch {
    /* table may not exist */
  }
  return <ConfigClient data={data} />
}
