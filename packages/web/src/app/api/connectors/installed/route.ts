import { NextResponse } from 'next/server'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export async function GET() {
  const dirs = [
    join(homedir(), '.hasna', 'assistants', 'connectors'),
    join(process.cwd(), '.assistants', 'connectors'),
  ]

  const installed: Array<{ name: string; scope: string; path: string; meta?: Record<string, unknown> }> = []

  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    const scope = dir.includes(homedir()) ? 'global' : 'project'
    try {
      for (const entry of readdirSync(dir)) {
        const entryPath = join(dir, entry)
        let meta: Record<string, unknown> | undefined
        try {
          const pkgPath = join(entryPath, 'package.json')
          if (existsSync(pkgPath)) {
            meta = JSON.parse(readFileSync(pkgPath, 'utf-8'))
          }
        } catch { /* ignore */ }
        installed.push({ name: entry, scope, path: entryPath, meta })
      }
    } catch { /* ignore */ }
  }

  return NextResponse.json({ installed })
}
