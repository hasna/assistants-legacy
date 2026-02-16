import { getDb } from "@/lib/db"
import { AssistantsClient } from "./client"

export interface AssistantConfigRow {
  id: string
  name: string
  model: string | null
  system_prompt: string | null
  settings: string | null
  identity_id: string | null
  created_at: string
  updated_at: string
}

export interface RegisteredAssistantRow {
  id: string
  name: string
  type: string | null
  description: string | null
  model: string | null
  status: string
  created_at: string
  updated_at: string
}

export default function AssistantsPage() {
  let configData: AssistantConfigRow[] = []
  let registeredData: RegisteredAssistantRow[] = []
  try {
    const db = getDb()
    try {
      configData = db
        .prepare(
          "SELECT id, name, model, system_prompt, settings, identity_id, created_at, updated_at FROM assistants_config ORDER BY updated_at DESC LIMIT 500"
        )
        .all() as AssistantConfigRow[]
    } catch {
      /* assistants_config table may not exist */
    }
    try {
      registeredData = db
        .prepare(
          "SELECT id, name, type, description, model, status, created_at, updated_at FROM registered_assistants ORDER BY created_at DESC LIMIT 500"
        )
        .all() as RegisteredAssistantRow[]
    } catch {
      /* registered_assistants table may not exist */
    }
  } catch {
    /* db may not be available */
  }
  return (
    <AssistantsClient configData={configData} registeredData={registeredData} />
  )
}
