import { readdirSync, statSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { SkillsClient } from "./client"

export interface SkillRow {
  name: string
  path: string
  type: string
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
            skills.push({
              name: entry,
              path: skillFile,
              type,
            })
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
