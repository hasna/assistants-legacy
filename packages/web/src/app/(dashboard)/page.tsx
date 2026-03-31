import { getDb } from "@/lib/db"
import Link from "next/link"

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  href: string
  color: string
}

function StatCard({ label, value, sub, href, color }: StatCardProps) {
  return (
    <Link href={href} className="group block rounded-xl border border-border bg-card p-6 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="mt-1.5 text-sm font-medium">{label}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Link>
  )
}

export default function DashboardHome() {
  const db = getDb()

  const totalSessions = (db.prepare("SELECT COUNT(*) as c FROM persisted_sessions").get() as { c: number })?.c ?? 0
  const activeSessions = (db.prepare("SELECT COUNT(*) as c FROM persisted_sessions WHERE status = 'active'").get() as { c: number })?.c ?? 0
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const sessionsToday = (db.prepare("SELECT COUNT(*) as c FROM persisted_sessions WHERE updated_at >= ?").get(todayStart.getTime()) as { c: number })?.c ?? 0

  let pendingTasks = 0, inProgressTasks = 0, completedTasks = 0
  try {
    pendingTasks = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'pending'").get() as { c: number })?.c ?? 0
    inProgressTasks = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'in_progress'").get() as { c: number })?.c ?? 0
    completedTasks = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'completed'").get() as { c: number })?.c ?? 0
  } catch { /**/ }

  let totalMemories = 0, highImportanceMemories = 0
  try {
    totalMemories = (db.prepare("SELECT COUNT(*) as c FROM memories").get() as { c: number })?.c ?? 0
    highImportanceMemories = (db.prepare("SELECT COUNT(*) as c FROM memories WHERE importance >= 8").get() as { c: number })?.c ?? 0
  } catch { /**/ }

  let activeSchedules = 0
  try {
    activeSchedules = (db.prepare("SELECT COUNT(*) as c FROM schedules WHERE status = 'active'").get() as { c: number })?.c ?? 0
  } catch { /**/ }

  let recentSessions: Array<{ id: string; label: string | null; status: string; updated_at: number; message_count: number }> = []
  try {
    recentSessions = db.prepare(
      `SELECT s.id, s.label, s.status, s.updated_at,
        (SELECT COUNT(*) FROM session_messages sm WHERE sm.session_id = s.id) as message_count
       FROM persisted_sessions s ORDER BY s.updated_at DESC LIMIT 5`
    ).all() as typeof recentSessions
  } catch { /**/ }

  const lastSession = db.prepare("SELECT updated_at FROM persisted_sessions ORDER BY updated_at DESC LIMIT 1").get() as { updated_at: number } | undefined
  const lastActive = lastSession
    ? new Date(lastSession.updated_at < 1e12 ? lastSession.updated_at * 1000 : lastSession.updated_at)
        .toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "No sessions yet"

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1.5">Overview of your assistant activity</p>
        </div>
        <Link href="/chat" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:shadow-md hover:bg-primary/90 hover:-translate-y-px active:translate-y-0 transition-all duration-150">
          New Chat
        </Link>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Overview</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Sessions Today" value={sessionsToday} sub={`${totalSessions} total \u00b7 ${activeSessions} active`} href="/sessions" color="text-blue-600 dark:text-blue-400" />
          <StatCard label="Pending Tasks" value={pendingTasks} sub={`${inProgressTasks} in progress \u00b7 ${completedTasks} done`} href="/tasks" color="text-orange-600 dark:text-orange-400" />
          <StatCard label="Memories" value={totalMemories} sub={`${highImportanceMemories} high importance`} href="/memory" color="text-purple-600 dark:text-purple-400" />
          <StatCard label="Active Schedules" value={activeSchedules} sub="running jobs" href="/schedules" color="text-green-600 dark:text-green-400" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-xs p-4 text-sm flex flex-wrap items-center gap-2 text-muted-foreground">
        <span>Last session:</span>
        <span className="text-foreground font-medium">{lastActive}</span>
        {inProgressTasks > 0 && (
          <span>\u00b7<Link href="/tasks" className="ml-1 text-blue-600 dark:text-blue-400 hover:underline">{inProgressTasks} task{inProgressTasks !== 1 ? "s" : ""} in progress</Link></span>
        )}
      </div>

      {recentSessions.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Recent Sessions</h2>
          <div className="rounded-xl border border-border bg-card shadow-xs divide-y divide-border">
            {recentSessions.map((s) => {
              const ts = new Date(s.updated_at < 1e12 ? s.updated_at * 1000 : s.updated_at)
              const timeStr = ts.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
              return (
                <Link key={s.id} href={`/sessions/${s.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-accent/40 transition-colors first:rounded-t-xl last:rounded-b-xl">
                  <div className="flex items-center gap-3">
                    <span className={`h-2 w-2 rounded-full ${s.status === 'active' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                    <span className="text-sm font-medium">{s.label || `Session ${s.id.slice(0, 8)}`}</span>
                    <span className="text-xs text-muted-foreground">{s.message_count} msgs</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{timeStr}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Navigate</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {[
            { href: "/chat", label: "Chat" }, { href: "/sessions", label: "Sessions" },
            { href: "/tasks", label: "Tasks" }, { href: "/memory", label: "Memory" },
            { href: "/schedules", label: "Schedules" }, { href: "/skills", label: "Skills" },
            { href: "/heartbeat", label: "Heartbeat" }, { href: "/logs", label: "Logs" },
            { href: "/connectors", label: "Connectors" }, { href: "/hooks", label: "Hooks" },
            { href: "/config", label: "Config" }, { href: "/projects", label: "Projects" },
          ].map(({ href, label }) => (
            <Link key={href} href={href} className="rounded-xl border border-border bg-card shadow-xs px-3 py-2.5 text-xs font-medium text-center hover:bg-accent/60 hover:shadow-sm hover:-translate-y-px transition-all duration-150">
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
