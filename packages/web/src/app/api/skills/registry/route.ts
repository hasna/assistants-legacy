import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')
  const category = searchParams.get('category')

  try {
    let cmd = 'skills'
    if (query) {
      cmd += ` search ${JSON.stringify(query)} --json`
    } else if (category) {
      cmd += ` list --json --category ${JSON.stringify(category)}`
    } else {
      cmd += ' list --json'
    }
    const output = execSync(cmd, { timeout: 10000, encoding: 'utf-8' })
    const skills = JSON.parse(output)
    return NextResponse.json({ skills })
  } catch (err) {
    return NextResponse.json({ skills: [], error: String(err) }, { status: 500 })
  }
}
