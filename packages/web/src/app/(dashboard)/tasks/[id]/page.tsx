import { getDb } from "@/lib/db"
import { notFound } from "next/navigation"
import { TaskDetailClient } from "./client"

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let data = null
  try {
    const db = getDb()
    data = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id)
  } catch {
    /* table may not exist */
  }

  if (!data) notFound()

  return <TaskDetailClient data={data as any} />
}
