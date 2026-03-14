import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get('name')
  if (!name) return NextResponse.json({ ok: false })

  try {
    // Try running `<connector-name> --version` to check if binary is available
    execSync(`which ${name}`, { stdio: 'pipe', timeout: 2000 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
