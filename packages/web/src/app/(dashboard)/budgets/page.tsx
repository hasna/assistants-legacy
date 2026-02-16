import { getDb } from "@/lib/db"
import { BudgetsClient } from "./client"

export interface BudgetRow {
  scope: string
  scope_id: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  api_calls: number
  tool_calls: number
  estimated_cost_usd: number
  updated_at: string
}

export default function BudgetsPage() {
  let data: BudgetRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT scope, scope_id, input_tokens, output_tokens, total_tokens, api_calls, tool_calls, estimated_cost_usd, updated_at FROM budget_usage ORDER BY updated_at DESC LIMIT 500"
      )
      .all() as BudgetRow[]
  } catch {
    /* table may not exist */
  }
  return <BudgetsClient data={data} />
}
