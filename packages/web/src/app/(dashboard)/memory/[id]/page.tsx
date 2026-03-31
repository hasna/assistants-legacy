import { getDb } from "@/lib/db"
import { notFound } from "next/navigation"
import { MemoryDetailClient } from "./client"

export default async function MemoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let data = null
  try {
    const db = getDb()
    data = db.prepare("SELECT * FROM memories WHERE id = ?").get(id)
  } catch {
    /* table may not exist */
  }

  if (!data) notFound()

  return <MemoryDetailClient data={data as any} />
}
