import { getDb } from "@/lib/db"
import { homedir } from "os"
import { join } from "path"
import { statSync, existsSync } from "fs"

interface TableCount {
  name: string
  count: number
}

interface EnvCheck {
  name: string
  set: boolean
}

function getAssistantsDir(): string {
  if (process.env.ASSISTANTS_DIR) return process.env.ASSISTANTS_DIR
  const profile = process.env.ASSISTANTS_PROFILE
  const home = homedir()
  if (profile) return join(home, ".hasna", "assistants", "profiles", profile)
  return join(home, ".hasna", "assistants")
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function StatusPage() {
  const dir = getAssistantsDir()
  const dbPath = join(dir, "assistants.db")

  // Database info
  let dbConnected = false
  let dbSize = 0
  const tableCounts: TableCount[] = []

  try {
    if (existsSync(dbPath)) {
      dbSize = statSync(dbPath).size
    }
    const db = getDb()
    dbConnected = true

    // Get table counts
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>

    for (const t of tables) {
      try {
        const row = db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get() as { count: number }
        tableCounts.push({ name: t.name, count: row.count })
      } catch {
        tableCounts.push({ name: t.name, count: -1 })
      }
    }
  } catch {
    /* db not available */
  }

  // Environment checks
  const envChecks: EnvCheck[] = [
    { name: "ANTHROPIC_API_KEY", set: !!process.env.ANTHROPIC_API_KEY },
    { name: "OPENAI_API_KEY", set: !!process.env.OPENAI_API_KEY },
    { name: "ELEVENLABS_API_KEY", set: !!process.env.ELEVENLABS_API_KEY },
    { name: "EXA_API_KEY", set: !!process.env.EXA_API_KEY },
    { name: "AWS_ACCESS_KEY_ID", set: !!process.env.AWS_ACCESS_KEY_ID },
  ]

  // System info
  const nodeVersion = process.version
  const platform = process.platform
  const arch = process.arch
  const uptimeSeconds = Math.floor(process.uptime())
  const uptimeStr =
    uptimeSeconds < 60
      ? `${uptimeSeconds}s`
      : uptimeSeconds < 3600
        ? `${Math.floor(uptimeSeconds / 60)}m ${uptimeSeconds % 60}s`
        : `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`

  return (
    <div className="flex flex-col gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">System Status</h1>
        <p className="text-muted-foreground text-sm">
          Health check and system information.
        </p>
      </div>

      {/* Database Status */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold mb-3">Database</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-muted-foreground">Status</span>
          <span>
            {dbConnected ? (
              <span className="text-green-600 font-medium">Connected</span>
            ) : (
              <span className="text-red-600 font-medium">Disconnected</span>
            )}
          </span>
          <span className="text-muted-foreground">Path</span>
          <span className="font-mono text-xs truncate" title={dbPath}>
            {dbPath}
          </span>
          <span className="text-muted-foreground">Size</span>
          <span>{formatBytes(dbSize)}</span>
          <span className="text-muted-foreground">Tables</span>
          <span>{tableCounts.length}</span>
        </div>
        {tableCounts.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <h3 className="text-xs text-muted-foreground font-medium mb-2">
              Table Counts
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1 text-xs">
              {tableCounts.map((t) => (
                <div key={t.name} className="flex justify-between">
                  <span className="text-muted-foreground truncate">
                    {t.name}
                  </span>
                  <span className="tabular-nums ml-2">
                    {t.count >= 0 ? t.count : "?"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* API Keys */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold mb-3">API Keys</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {envChecks.map((e) => (
            <div key={e.name} className="contents">
              <span className="text-muted-foreground font-mono text-xs">
                {e.name}
              </span>
              <span>
                {e.set ? (
                  <span className="text-green-600">Configured</span>
                ) : (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* System Info */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold mb-3">System</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-muted-foreground">Runtime</span>
          <span>{nodeVersion}</span>
          <span className="text-muted-foreground">Platform</span>
          <span>
            {platform} ({arch})
          </span>
          <span className="text-muted-foreground">Process Uptime</span>
          <span>{uptimeStr}</span>
          <span className="text-muted-foreground">Data Directory</span>
          <span className="font-mono text-xs truncate" title={dir}>
            {dir}
          </span>
        </div>
      </div>
    </div>
  )
}
