"use client"

import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { SiteHeader } from "@/components/dashboard/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

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
        {!isChat && <SiteHeader />}
        <div className={isChat ? "flex flex-1 flex-col overflow-hidden" : "flex flex-1 flex-col overflow-auto"}>
          <div className={isChat ? "flex flex-1 flex-col" : "flex flex-1 flex-col gap-4 p-4 lg:p-6"}>
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
