import { NextResponse } from "next/server"
import { writeFileSync, readFileSync, existsSync } from "fs"
import { join } from "path"

export function GET() {
  return NextResponse.json({
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasOpenAIKey: !!process.env.OPENAI_API_KEY,
  })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const envPath = join(process.cwd(), ".env.local")

    // Read existing .env.local if present
    let existing = ""
    if (existsSync(envPath)) {
      existing = readFileSync(envPath, "utf-8")
    }

    const lines = existing.split("\n").filter(Boolean)

    // Update or add keys
    const updates: Record<string, string> = {}
    if (body.anthropicKey) updates["ANTHROPIC_API_KEY"] = body.anthropicKey
    if (body.openaiKey) updates["OPENAI_API_KEY"] = body.openaiKey

    for (const [key, value] of Object.entries(updates)) {
      const idx = lines.findIndex((l) => l.startsWith(`${key}=`))
      const line = `${key}=${value}`
      if (idx >= 0) {
        lines[idx] = line
      } else {
        lines.push(line)
      }
      // Also set in current process
      process.env[key] = value
    }

    writeFileSync(envPath, lines.join("\n") + "\n", "utf-8")

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    )
  }
}
