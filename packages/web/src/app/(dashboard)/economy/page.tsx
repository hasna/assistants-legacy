import { getDb } from "@/lib/db"
import { EconomyClient, type CostRow } from "./client"

export default function EconomyPage() {
  let data: CostRow[] = []
  let totalSpend = 0
  let todaySpend = 0

  try {
    const db = getDb()
    data = db
      .prepare("SELECT * FROM budget_usage ORDER BY created_at DESC LIMIT 500")
      .all() as CostRow[]

    const totalRow = db.prepare("SELECT SUM(cost) as total FROM budget_usage").get() as { total: number | null } | undefined
    totalSpend = totalRow?.total ?? 0

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayRow = db.prepare("SELECT SUM(cost) as total FROM budget_usage WHERE created_at >= ?").get(todayStart.getTime()) as { total: number | null } | undefined
    todaySpend = todayRow?.total ?? 0
  } catch {
    /* table may not exist */
  }
  return <EconomyClient data={data} totalSpend={totalSpend} todaySpend={todaySpend} />
}
