"use client"

import { usePathname } from "next/navigation"
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

export function SiteHeader() {
  const pathname = usePathname()
  const title = pageTitles[pathname] || "Dashboard"

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{title}</h1>
      </div>
    </header>
  )
}
