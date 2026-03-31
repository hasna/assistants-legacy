import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

export async function POST(req: Request) {
  const body = await req.json() as { name?: string; names?: string[] }
  const names = body.names ?? (body.name ? [body.name] : [])

  if (names.length === 0) {
    return NextResponse.json({ error: 'Connector name(s) required' }, { status: 400 })
  }

  try {
    const cmd = `connectors install ${names.map(n => JSON.stringify(n)).join(' ')} --json`
    const output = execSync(cmd, { timeout: 30000, encoding: 'utf-8' })
    const result = JSON.parse(output)
    return NextResponse.json({ success: true, result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
