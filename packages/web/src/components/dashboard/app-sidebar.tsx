"use client"

import {
  MessageSquare,
  History,
  ListTodo,
  Clock,
  Play,
  FolderOpen,
  FileText,
  ShoppingCart,
  Settings,
  Cpu,
  Webhook,
  Sparkles,
  Plug,
  Shield,
  DollarSign,
  Brain,
  ScrollText,
  Mail,
  Hash,
  Globe,
  Users,
  UserCircle,
  Bot,
  Fingerprint,
  Briefcase,
  Wallet,
  KeyRound,
  Activity,
} from "lucide-react"

import { NavMain } from "@/components/dashboard/nav-main"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const navGroups = [
  {
    title: "Main",
    icon: MessageSquare,
    items: [
      { title: "Chat", url: "/chat" },
      { title: "Sessions", url: "/sessions", countKey: "sessions" },
    ],
  },
  {
    title: "Management",
    icon: ListTodo,
    items: [
      { title: "Tasks", url: "/tasks", countKey: "tasks" },
      { title: "Schedules", url: "/schedules", countKey: "schedules" },
      { title: "Projects", url: "/projects" },
      { title: "Plans", url: "/plans" },
      { title: "Orders", url: "/orders" },
    ],
  },
  {
    title: "Configuration",
    icon: Settings,
    items: [
      { title: "Config", url: "/config" },
      { title: "Model", url: "/model" },
      { title: "Hooks", url: "/hooks" },
      { title: "Skills", url: "/skills" },
      { title: "Connectors", url: "/connectors" },
      { title: "Guardrails", url: "/guardrails" },
      { title: "Budgets", url: "/budgets" },
    ],
  },
  {
    title: "Data & Memory",
    icon: Brain,
    items: [
      { title: "Memory", url: "/memory", countKey: "memory" },
      { title: "Logs", url: "/logs" },
      { title: "Recordings", url: "/recordings" },
      { title: "Economy", url: "/economy" },
    ],
  },
  {
    title: "Communication",
    icon: Mail,
    items: [
      { title: "Messages", url: "/messages" },
      { title: "Emails", url: "/emails" },
      { title: "Channels", url: "/channels" },
      { title: "Webhooks", url: "/webhooks" },
      { title: "Contacts", url: "/contacts" },
      { title: "People", url: "/people" },
    ],
  },
  {
    title: "Identity & Assistants",
    icon: Bot,
    items: [
      { title: "Assistants", url: "/assistants" },
      { title: "Identity", url: "/identity" },
      { title: "Workspace", url: "/workspace" },
    ],
  },
  {
    title: "Credentials",
    icon: KeyRound,
    items: [
      { title: "Wallet", url: "/wallet" },
      { title: "Secrets", url: "/secrets" },
    ],
  },
  {
    title: "Monitoring",
    icon: Activity,
    items: [
      { title: "Heartbeat", url: "/heartbeat" },
      { title: "Status", url: "/status" },
    ],
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <a href="/">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Bot className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Assistants</span>
                  <span className="truncate text-xs">Dashboard</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navGroups} />
      </SidebarContent>
      <SidebarFooter />
      <SidebarRail />
    </Sidebar>
  )
}
