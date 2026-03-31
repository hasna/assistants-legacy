import { getDb } from "@/lib/db"
import { EmailsClient, type EmailRow } from "./client"

export default function EmailsPage() {
  let sent: EmailRow[] = []
  let inbox: EmailRow[] = []
  try {
    const db = getDb()
    sent = db
      .prepare("SELECT * FROM emails WHERE direction = 'outbound' ORDER BY created_at DESC LIMIT 200")
      .all() as EmailRow[]
    inbox = db
      .prepare("SELECT * FROM emails WHERE direction = 'inbound' ORDER BY created_at DESC LIMIT 200")
      .all() as EmailRow[]
  } catch {
    try {
      const db = getDb()
      const all = db
        .prepare("SELECT * FROM emails ORDER BY created_at DESC LIMIT 500")
        .all() as EmailRow[]
      sent = all
    } catch {
      /* table may not exist */
    }
  }
  return <EmailsClient sent={sent} inbox={inbox} />
}
