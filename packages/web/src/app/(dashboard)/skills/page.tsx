import { existsSync, readdirSync, statSync, readFileSync } from "fs"
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
  const hint = fm.match(/^argument-hint:\s*(.+)$/m)?.[1]?.trim() ??
               fm.match(/^argument_hint:\s*(.+)$/m)?.[1]?.trim() ??
               fm.match(/^argumentHint:\s*(.+)$/m)?.[1]?.trim() ?? null
  const triggerLine = fm.match(/^triggers:\s*\[(.+)\]/m)?.[1]
  const triggers = triggerLine
    ? triggerLine.split(",").map(t => t.trim().replace(/['"]/g, "")).filter(Boolean)
    : []

  return { description: desc, argumentHint: hint, triggers }
}

function scanSkillsDir(dir: string, type: string): SkillRow[] {
  const skills: SkillRow[] = []
  if (!existsSync(dir)) return skills
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry)
      try {
        if (!statSync(fullPath).isDirectory()) continue
        const skillFile = join(fullPath, "SKILL.md")
        if (!existsSync(skillFile)) continue
        let description: string | null = null
        let argumentHint: string | null = null
        let triggers: string[] = []
        try {
          const parsed = parseSkillFrontmatter(readFileSync(skillFile, "utf-8"))
          description = parsed.description
          argumentHint = parsed.argumentHint
          triggers = parsed.triggers
        } catch { /* cannot read SKILL.md */ }
        skills.push({ name: entry, path: skillFile, type, description, argumentHint, triggers })
      } catch { /* cannot stat entry */ }
    }
  } catch { /* directory does not exist */ }
  return skills
}

export default function SkillsPage() {
  const seen = new Set<string>()
  const rows: SkillRow[] = []

  function addSkills(dir: string, type: string) {
    for (const row of scanSkillsDir(dir, type)) {
      if (!seen.has(row.name)) {
        seen.add(row.name)
        rows.push(row)
      }
    }
  }

  // 1. Legacy built-in skills (.assistants/skills/)
  addSkills(join(process.cwd(), ".assistants", "skills"), "built-in")

  // 2. User skills (~/.hasna/assistants/skills/)
  addSkills(join(homedir(), ".hasna", "assistants", "skills"), "user")

  // 3. @hasna/skills SDK — global agent skills (~/.claude/skills/)
  addSkills(join(homedir(), ".claude", "skills"), "sdk-global")

  // 4. @hasna/skills SDK — project agent skills (.claude/skills/)
  addSkills(join(process.cwd(), ".claude", "skills"), "sdk-project")

  // 5. Legacy .skill dirs
  addSkills(join(homedir(), ".skill"), "skill-global")
  addSkills(join(process.cwd(), ".skill"), "skill-project")

  return <SkillsClient data={rows} />
}
