"use client"

import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { SiteHeader } from "@/components/dashboard/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { CommandPalette } from "@/components/dashboard/command-palette"
import { KeyboardHelp } from "@/components/dashboard/keyboard-help"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isChat = pathname.startsWith("/chat")

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16rem",
          "--header-height": "3rem",
        } as React.CSSProperties
      }
    >
      <AppSidebar />
      <SidebarInset>
        {/* Command palette — keyboard shortcut ⌘K, no visible button needed */}
        <CommandPalette />
        <KeyboardHelp />
        {!isChat && <SiteHeader />}
        <div className={isChat ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "flex min-h-0 flex-1 flex-col overflow-hidden"}>
          <div className={isChat ? "flex min-h-0 flex-1 flex-col" : "flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 lg:p-6"}>
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
