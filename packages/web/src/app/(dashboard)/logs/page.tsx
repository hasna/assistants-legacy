import { getDb } from "@/lib/db"
import { LogsClient } from "./client"

export interface LogRow {
  id: string
  session_id: string | null
  assistant_id: string | null
  rule_id: string
  rule_name: string
  input_text: string
  result: string
  score: number | null
  details: string | null
  created_at: string
}

export default function LogsPage() {
  let data: LogRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT id, session_id, assistant_id, rule_id, rule_name, input_text, result, score, details, created_at FROM guardrail_evaluations ORDER BY created_at DESC LIMIT 500"
      )
      .all() as LogRow[]
  } catch {
    /* table may not exist */
  }
  return <LogsClient data={data} />
}
