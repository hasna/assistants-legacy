'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface NavItem {
  label: string
  href: string
  keywords?: string
}

const NAV_ITEMS: NavItem[] = [
  { label: '💬 Chat — New conversation', href: '/chat', keywords: 'chat message talk' },
  { label: '📋 Sessions — Browse past conversations', href: '/sessions', keywords: 'sessions history past' },
  { label: '✅ Tasks — Manage task queue', href: '/tasks', keywords: 'tasks todo work pending' },
  { label: '🧠 Memory — View stored memories', href: '/memory', keywords: 'memory facts preferences' },
  { label: '⏰ Schedules — Manage scheduled jobs', href: '/schedules', keywords: 'schedule cron interval timer' },
  { label: '⚡ Skills — Browse available skills', href: '/skills', keywords: 'skills commands prompts' },
  { label: '🔌 Connectors — External integrations', href: '/connectors', keywords: 'connectors integrations api' },
  { label: '🪝 Hooks — Lifecycle hooks', href: '/hooks', keywords: 'hooks lifecycle intercept' },
  { label: '⚙️ Config — Configuration settings', href: '/config', keywords: 'config settings preferences' },
  { label: '💓 Heartbeat — Session heartbeat history', href: '/heartbeat', keywords: 'heartbeat monitor' },
  { label: '📁 Projects — Registered projects', href: '/projects', keywords: 'projects workspace' },
  { label: '👤 Identity — Assistant identity', href: '/identity', keywords: 'identity name persona' },
  { label: '🔒 Guardrail Logs — Security evaluations', href: '/logs', keywords: 'logs security guardrail' },
  { label: '💰 Budgets — Token budgets', href: '/budgets', keywords: 'budget tokens cost' },
  { label: '🏠 Dashboard — Home overview', href: '/', keywords: 'home dashboard overview stats' },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [entityResults, setEntityResults] = useState<Array<{ type: string; title: string; subtitle?: string; href: string }>>([])
  const router = useRouter()
  const listRef = useRef<HTMLDivElement>(null)

  const handleOpen = useCallback(() => { setOpen(true); setQuery(''); setSelectedIndex(0) }, [])
  const handleClose = useCallback(() => setOpen(false), [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
        setQuery('')
        setSelectedIndex(0)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        router.push('/chat')
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [router])

  const filtered = query.trim()
    ? NAV_ITEMS.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.keywords?.toLowerCase().includes(query.toLowerCase())
      )
    : NAV_ITEMS

  // Entity search when query is long enough
  useEffect(() => {
    if (query.trim().length < 2) { setEntityResults([]); return }
    const controller = new AbortController()
    fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setEntityResults(data.results || []))
      .catch(() => {})
    return () => controller.abort()
  }, [query])

  // Combined items: nav items first, then entity results
  const allItems = [
    ...filtered.map((item) => ({ label: item.label, href: item.href, type: 'page' as const })),
    ...entityResults.map((r) => ({ label: `${r.type}: ${r.title}`, href: r.href, type: 'entity' as const, subtitle: r.subtitle })),
  ]

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const navigate = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.children[selectedIndex] as HTMLElement | undefined
    selected?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => (i + 1) % (allItems.length || 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => (i - 1 + (allItems.length || 1)) % (allItems.length || 1))
    } else if (e.key === 'Enter' && allItems.length > 0) {
      e.preventDefault()
      navigate(allItems[selectedIndex].href)
    }
  }

  // No visible trigger button — use ⌘K keyboard shortcut to open
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={handleClose}>
      <div
        className="w-full max-w-xl rounded-xl border bg-background shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <span className="text-muted-foreground">🔍</span>
          <input
            autoFocus
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            placeholder="Search pages and actions…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {allItems.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">No results</div>
          ) : (
            <>
              {filtered.length > 0 && entityResults.length > 0 && (
                <div className="px-4 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Pages</div>
              )}
              {allItems.map((item, i) => (
                <button
                  key={`${item.type}-${item.href}-${i}`}
                  onClick={() => navigate(item.href)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                    i === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  {'subtitle' in item && item.subtitle && (
                    <span className="ml-auto text-xs text-muted-foreground truncate">{item.subtitle}</span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
