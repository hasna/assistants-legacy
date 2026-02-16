import { getDb } from "@/lib/db"
import { GuardrailsClient } from "./client"

export interface GuardrailRow {
  id: string
  name: string
  scope: string | null
  enabled: number
  policy_json: string | null
  location: string | null
  created_at: string
  updated_at: string
}

export default function GuardrailsPage() {
  let data: GuardrailRow[] = []
  try {
    const db = getDb()
    data = db
      .prepare(
        "SELECT id, name, scope, enabled, policy_json, location, created_at, updated_at FROM guardrails_policies ORDER BY updated_at DESC LIMIT 500"
      )
      .all() as GuardrailRow[]
  } catch {
    /* table may not exist */
  }
  return <GuardrailsClient data={data} />
}
