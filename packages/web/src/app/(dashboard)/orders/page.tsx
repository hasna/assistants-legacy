import { getDb } from "@/lib/db"
import { OrdersClient, type OrderRow } from "./client"

export default function OrdersPage() {
  let data: OrderRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500")
      .all() as OrderRow[]
  } catch {
    /* table may not exist */
  }
  return <OrdersClient data={data} />
}
