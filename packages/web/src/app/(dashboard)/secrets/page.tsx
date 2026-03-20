/**
 * Secrets page — reads from @hasna/secrets vault (~/.open-secrets/vault.db)
 */
import { SecretsClient } from "./client"

export interface SecretRow {
  key: string
  name: string
  namespace: string
  type: string
  label: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

export default function SecretsPage() {
  let data: SecretRow[] = []
  try {
    // Direct SQLite access to @hasna/secrets vault (same DB as the CLI)
    const { Database } = require("bun:sqlite") as typeof import("bun:sqlite")
    const { join } = require("path") as typeof import("path")
    const { homedir } = require("os") as typeof import("os")
    const { existsSync } = require("fs") as typeof import("fs")

    const dbPath = process.env.OPEN_SECRETS_DB ?? join(homedir(), ".open-secrets", "vault.db")
    if (existsSync(dbPath)) {
      const db = new Database(dbPath, { readonly: true })
      const rows = db.prepare("SELECT key, value, type, label, expires_at, created_at, updated_at FROM secrets ORDER BY updated_at DESC LIMIT 500").all() as Array<{
        key: string; value: string; type: string; label: string | null; expires_at: string | null; created_at: string; updated_at: string
      }>

      data = rows.map(r => {
        let name = r.key
        let namespace = "assistant"
        if (r.key.startsWith("global/")) { name = r.key.slice(7); namespace = "global" }
        else { const m = r.key.match(/^assistant\/[^/]+\/(.+)$/); if (m) name = m[1] }
        return { key: r.key, name, namespace, type: r.type, label: r.label, expires_at: r.expires_at, created_at: r.created_at, updated_at: r.updated_at }
      })
      db.close()
    }
  } catch {
    /* vault not yet created or inaccessible */
  }
  return <SecretsClient data={data} />
}
