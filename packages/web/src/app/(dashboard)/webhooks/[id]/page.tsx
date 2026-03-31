import { getDb } from "@/lib/db"
import { notFound } from "next/navigation"
import { WebhookDetailClient } from "./client"

export default async function WebhookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let data = null
  try {
    const db = getDb()
    data = db.prepare("SELECT * FROM webhook_registrations WHERE id = ?").get(id)
  } catch {
    /* table may not exist */
  }

  if (!data) notFound()

  return <WebhookDetailClient data={data as any} />
}
