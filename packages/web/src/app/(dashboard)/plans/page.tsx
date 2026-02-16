import { getDb } from "@/lib/db"
import { PlansClient, type PlanRow } from "./client"

export default function PlansPage() {
  let data: PlanRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare("SELECT * FROM plans LIMIT 500")
      .all() as PlanRow[]
  } catch {
    /* table may not exist */
  }
  return <PlansClient data={data} />
}
