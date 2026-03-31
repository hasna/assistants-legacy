"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, Star, type LucideIcon } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

interface NavSubItem {
  title: string
  url: string
  /** Key into the counts object for badge display */
  countKey?: string
}

interface Counts {
  tasks?: number
  sessions?: number
  memories?: number
  schedules?: number
}

function useSidebarCounts(): Counts {
  const [counts, setCounts] = useState<Counts>({})

  useEffect(() => {
    let cancelled = false
    const fetchCounts = () => {
      fetch("/api/counts")
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) setCounts(data)
        })
        .catch(() => {})
    }
    fetchCounts()
    const interval = setInterval(fetchCounts, 30000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return counts
}

function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem("sidebar-favorites")
      if (stored) setFavorites(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  const toggle = (url: string) => {
    setFavorites((prev) => {
      const next = prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
      localStorage.setItem("sidebar-favorites", JSON.stringify(next))
      return next
    })
  }

  return { favorites, toggle }
}

export function NavMain({
  items,
}: {
  items: {
    title: string
    icon: LucideIcon
    isActive?: boolean
    items: NavSubItem[]
  }[]
}) {
  const pathname = usePathname()
  const counts = useSidebarCounts()
  const { favorites, toggle: toggleFavorite } = useFavorites()

  const countMap: Record<string, number | undefined> = {
    tasks: counts.tasks,
    sessions: counts.sessions,
    memory: counts.memories,
    schedules: counts.schedules,
  }

  // Collect all sub-items for favorites lookup
  const allSubItems = items.flatMap((g) => g.items)
  const favoriteItems = favorites.map((url) => allSubItems.find((s) => s.url === url)).filter(Boolean) as NavSubItem[]

  return (
    <SidebarGroup>
      {/* Favorites section */}
      {favoriteItems.length > 0 && (
        <>
          <SidebarGroupLabel>Favorites</SidebarGroupLabel>
          <SidebarMenu>
            {favoriteItems.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={pathname === item.url}>
                  <Link href={item.url}>
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </>
      )}

      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const isGroupActive =
            item.isActive || item.items.some((sub) => pathname === sub.url)

          return (
            <Collapsible
              key={item.title}
              asChild
              defaultOpen={isGroupActive}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.title}>
                    <item.icon />
                    <span>{item.title}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items.map((subItem) => {
                      const count = subItem.countKey
                        ? countMap[subItem.countKey]
                        : undefined

                      return (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === subItem.url}
                          >
                            <Link href={subItem.url} className="group/link">
                              <span>{subItem.title}</span>
                              <span className="ml-auto flex items-center gap-1">
                                {count != null && count > 0 && (
                                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                                    {count}
                                  </span>
                                )}
                                <button
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(subItem.url) }}
                                  className={`h-3.5 w-3.5 transition-opacity ${favorites.includes(subItem.url) ? 'opacity-100' : 'opacity-0 group-hover/link:opacity-50 hover:!opacity-100'}`}
                                  title={favorites.includes(subItem.url) ? 'Remove from favorites' : 'Add to favorites'}
                                >
                                  <Star className={`h-3 w-3 ${favorites.includes(subItem.url) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                                </button>
                              </span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )
                    })}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
