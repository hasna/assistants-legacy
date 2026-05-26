import { afterEach, describe, expect, test } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

const WEB_ROOT = join(__dirname, "..")
const providerEnv = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "XAI_API_KEY",
  "MISTRAL_API_KEY",
]

const savedEnv = Object.fromEntries(providerEnv.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of providerEnv) {
    const value = savedEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("web AI SDK migration", () => {
  test("setup accepts any configured AI SDK provider key", async () => {
    for (const key of providerEnv) delete process.env[key]
    process.env.GEMINI_API_KEY = "gemini-test"

    const { GET } = await import("../src/app/api/setup/route")
    const body = await GET().json()

    expect(body.hasLLMKey).toBe(true)
    expect(body.providers.find((provider: { id: string }) => provider.id === "google")?.configured).toBe(true)
  })

  test("web model ids are provider-prefixed", async () => {
    const { DEFAULT_MODEL, WEB_MODELS } = await import("../src/lib/models")

    expect(DEFAULT_MODEL).toContain(":")
    expect(WEB_MODELS.every((model: { id: string }) => model.id.includes(":"))).toBe(true)
  })

  test("chat streaming emits tool start events before completion events", () => {
    const route = readFileSync(join(WEB_ROOT, "src/app/api/chat/route.ts"), "utf8")
    const startIndex = route.indexOf("tool_use_start")
    const completeIndex = route.indexOf("tool_use_complete")

    expect(startIndex).toBeGreaterThan(-1)
    expect(completeIndex).toBeGreaterThan(startIndex)
  })

  test("session chat page uses the shared default model", () => {
    const sessionPage = readFileSync(join(WEB_ROOT, "src/app/(dashboard)/chat/[sessionId]/page.tsx"), "utf8")

    expect(sessionPage).toContain("import { DEFAULT_MODEL } from '@/lib/models'")
    expect(sessionPage).toContain("useState(DEFAULT_MODEL)")
    expect(sessionPage).not.toContain("useState('claude-")
  })
})
