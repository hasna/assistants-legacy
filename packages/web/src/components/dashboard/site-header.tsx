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
  "/jobs": "Jobs",
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
  "/heartbeat": "Heartbeat",
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
      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  )
}

// Map section paths to parent groups for breadcrumbs
const sectionGroups: Record<string, string> = {
  "/tasks": "Management", "/schedules": "Management", "/jobs": "Management",
  "/projects": "Management", "/plans": "Management", "/orders": "Management",
  "/config": "Configuration", "/model": "Configuration", "/hooks": "Configuration",
  "/skills": "Configuration", "/connectors": "Configuration", "/guardrails": "Configuration",
  "/budgets": "Configuration",
  "/memory": "Data & Memory", "/logs": "Data & Memory",
  "/channels": "Communication", "/webhooks": "Communication", "/contacts": "Communication",
  "/messages": "Communication",
  "/assistants": "Identity & Assistants", "/identity": "Identity & Assistants",
  "/wallet": "Credentials", "/secrets": "Credentials",
  "/heartbeat": "Monitoring",
}

export function SiteHeader() {
  const pathname = usePathname()
  const title = pageTitles[pathname] || "Dashboard"
  const parentGroup = sectionGroups[pathname]

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
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
              <span className="text-muted-foreground">/</span>
            </>
          )}
          <h1 className="font-medium">{title}</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Cmd+K hint — clicking also opens the palette */}
          <button
            onClick={() => {
              const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
              window.dispatchEvent(event)
            }}
            className="hidden md:flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
            title="Search pages (⌘K)"
          >
            <span>🔍</span>
            <span>Search…</span>
            <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">⌘K</kbd>
          </button>
          <DarkModeToggle />
        </div>
      </div>
    </header>
  )
}
