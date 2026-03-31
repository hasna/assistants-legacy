import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

export async function POST(req: Request) {
  const body = await req.json() as {
    name?: string
    description?: string
    category?: string
    tags?: string
    global?: boolean
  }

  if (!body.name) {
    return NextResponse.json({ error: 'Skill name required' }, { status: 400 })
  }

  try {
    let cmd = `skills create ${JSON.stringify(body.name)} --json`
    if (body.description) cmd += ` --description ${JSON.stringify(body.description)}`
    if (body.category) cmd += ` --category ${JSON.stringify(body.category)}`
    if (body.tags) cmd += ` --tags ${JSON.stringify(body.tags)}`
    if (body.global) cmd += ' --global'

    const output = execSync(cmd, { timeout: 10000, encoding: 'utf-8' })
    const result = JSON.parse(output)
    return NextResponse.json({ success: true, result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
