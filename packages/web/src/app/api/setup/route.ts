import { NextResponse } from "next/server"
import { writeFileSync, readFileSync, existsSync } from "fs"
import { join } from "path"
import { LLM_PROVIDERS } from "@hasna/assistants-shared"

const PROVIDER_KEY_FIELDS = Object.fromEntries(
  LLM_PROVIDERS.map((provider) => [provider.id, provider.apiKeyEnv])
)

export function GET() {
  const providers = LLM_PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    apiKeyEnv: provider.apiKeyEnv,
    configured: !!process.env[provider.apiKeyEnv],
    docsUrl: provider.docsUrl,
  }))

  return NextResponse.json({
    hasLLMKey: providers.some((provider) => provider.configured),
    providers,
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
    const providerKeys = body.providerKeys && typeof body.providerKeys === "object"
      ? body.providerKeys as Record<string, unknown>
      : {}

    for (const [providerId, envName] of Object.entries(PROVIDER_KEY_FIELDS)) {
      const value = providerKeys[providerId]
      if (typeof value === "string" && value.trim()) {
        updates[envName] = value.trim()
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one AI SDK provider API key is required." },
        { status: 400 }
      )
    }

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
