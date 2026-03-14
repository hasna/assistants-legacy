import { readdirSync, statSync, readFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { SkillsClient } from "./client"

export interface SkillRow {
  name: string
  path: string
  type: string
  description: string | null
  argumentHint: string | null
  triggers: string[]
}

function parseSkillFrontmatter(content: string): {
  description: string | null
  argumentHint: string | null
  triggers: string[]
} {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return { description: null, argumentHint: null, triggers: [] }
  const fm = match[1]

  const desc = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? null
  const hint = fm.match(/^argument_hint:\s*(.+)$/m)?.[1]?.trim() ??
               fm.match(/^argumentHint:\s*(.+)$/m)?.[1]?.trim() ?? null
  const triggerLine = fm.match(/^triggers:\s*\[(.+)\]/m)?.[1]
  const triggers = triggerLine
    ? triggerLine.split(",").map(t => t.trim().replace(/['"]/g, "")).filter(Boolean)
    : []

  return { description: desc, argumentHint: hint, triggers }
}

function scanSkillsDir(dir: string, type: string): SkillRow[] {
  const skills: SkillRow[] = []
  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const fullPath = join(dir, entry)
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          const skillFile = join(fullPath, "SKILL.md")
          try {
            statSync(skillFile)
            let description: string | null = null
            let argumentHint: string | null = null
            let triggers: string[] = []
            try {
              const content = readFileSync(skillFile, "utf-8")
              const parsed = parseSkillFrontmatter(content)
              description = parsed.description
              argumentHint = parsed.argumentHint
              triggers = parsed.triggers
            } catch {
              /* cannot read SKILL.md */
            }
            skills.push({ name: entry, path: skillFile, type, description, argumentHint, triggers })
          } catch {
            /* SKILL.md not found in this directory */
          }
        }
      } catch {
        /* cannot stat entry */
      }
    }
  } catch {
    /* directory does not exist */
  }
  return skills
}

export default function SkillsPage() {
  const userSkillsDir = join(homedir(), ".assistants", "skills")
  const builtinSkillsDir = join(process.cwd(), ".assistants", "skills")

  const data: SkillRow[] = [
    ...scanSkillsDir(userSkillsDir, "user"),
    ...scanSkillsDir(builtinSkillsDir, "built-in"),
  ]

  return <SkillsClient data={data} />
}
