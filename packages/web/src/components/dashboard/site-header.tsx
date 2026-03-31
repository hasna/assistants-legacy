"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

const pageTitles: Record<string, string> = {
  "/chat": "Chat",
  "/sessions": "Sessions",
  "/tasks": "Tasks",
  "/schedules": "Schedules",
  "/projects": "Projects",
  "/plans": "Plans",
  "/orders": "Orders",
  "/config": "Configuration",
  "/model": "Model",
  "/hooks": "Hooks",
  "/skills": "Skills",
  "/connectors": "Connectors",
  "/guardrails": "Guardrails",
  "/budgets": "Budgets",
  "/memory": "Memory",
  "/logs": "Logs",
  "/messages": "Messages",
  "/channels": "Channels",
  "/webhooks": "Webhooks",
  "/contacts": "Contacts",
  "/people": "People",
  "/assistants": "Assistants",
  "/identity": "Identity",
  "/workspace": "Workspace",
  "/wallet": "Wallet",
  "/secrets": "Secrets",
  "/emails": "Emails",
  "/heartbeat": "Heartbeat",
  "/status": "Status",
  "/recordings": "Recordings",
  "/economy": "Economy",
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications] = useState<Array<{ id: string; text: string; time: string }>>([])

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-150 relative"
        title="Notifications"
      >
        🔔
        {notifications.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
            {notifications.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 rounded-xl border border-border bg-card shadow-xl z-50">
          <div className="p-3 border-b border-border">
            <h3 className="text-sm font-semibold">Notifications</h3>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No notifications
              </div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="px-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-accent/40 transition-colors">
                  <p className="text-sm">{n.text}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.time}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DarkModeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = stored === 'dark' || (!stored && prefersDark)
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  return (
    <button
      onClick={toggle}
      className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-150"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  )
}

const sectionGroups: Record<string, string> = {
  "/tasks": "Management", "/schedules": "Management",
  "/projects": "Management", "/plans": "Management", "/orders": "Management",
  "/config": "Configuration", "/model": "Configuration", "/hooks": "Configuration",
  "/skills": "Configuration", "/connectors": "Configuration", "/guardrails": "Configuration",
  "/budgets": "Configuration",
  "/memory": "Data & Memory", "/logs": "Data & Memory", "/recordings": "Data & Memory", "/economy": "Data & Memory",
  "/channels": "Communication", "/webhooks": "Communication", "/contacts": "Communication",
  "/messages": "Communication", "/emails": "Communication",
  "/assistants": "Identity & Assistants", "/identity": "Identity & Assistants",
  "/wallet": "Credentials", "/secrets": "Credentials",
  "/heartbeat": "Monitoring",
  "/status": "Monitoring",
}

export function SiteHeader() {
  const pathname = usePathname()
  const title = pageTitles[pathname] || "Dashboard"
  const parentGroup = sectionGroups[pathname]

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm">
          {parentGroup && (
            <>
              <span className="text-muted-foreground">{parentGroup}</span>
              <span className="text-muted-foreground/50">/</span>
            </>
          )}
          <h1 className="font-medium">{title}</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => {
              const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
              window.dispatchEvent(event)
            }}
            className="hidden md:flex items-center gap-1.5 rounded-lg border border-border bg-card shadow-xs px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:shadow-sm transition-all duration-150"
            title="Search pages (⌘K)"
          >
            <span className="text-[10px]">Search...</span>
            <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
          </button>
          <NotificationBell />
          <DarkModeToggle />
        </div>
      </div>
    </header>
  )
}
