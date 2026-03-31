import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

export async function POST(req: Request) {
  const body = await req.json() as { name?: string; scope?: string }
  if (!body.name) {
    return NextResponse.json({ error: 'Skill name required' }, { status: 400 })
  }

  const scope = body.scope ?? 'global'

  try {
    execSync(`skills remove ${JSON.stringify(body.name)} --scope ${scope} --json`, { timeout: 10000, encoding: 'utf-8' })
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
