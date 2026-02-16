import { getDb } from "@/lib/db"
import { WebhooksClient } from "./client"

export interface WebhookRow {
  id: string
  name: string
  source: string
  url: string
  secret: string | null
  events: string
  status: string
  delivery_count: number
  last_delivery_at: string | null
  created_at: string
}

export default function WebhooksPage() {
  let data: WebhookRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT id, name, source, url, secret, events, status, delivery_count, last_delivery_at, created_at FROM webhook_registrations ORDER BY created_at DESC LIMIT 500"
      )
      .all() as WebhookRow[]
  } catch {
    /* table may not exist */
  }
  return <WebhooksClient data={data} />
}
