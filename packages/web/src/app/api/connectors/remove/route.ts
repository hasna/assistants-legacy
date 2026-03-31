import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

export async function POST(req: Request) {
  const body = await req.json() as { name?: string }
  if (!body.name) {
    return NextResponse.json({ error: 'Connector name required' }, { status: 400 })
  }

  try {
    execSync(`connectors remove ${JSON.stringify(body.name)}`, { timeout: 10000, encoding: 'utf-8' })
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
