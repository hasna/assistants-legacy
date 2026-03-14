'use client'

import { useEffect, useState, useCallback } from 'react'
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
  const router = useRouter()

  const handleOpen = useCallback(() => { setOpen(true); setQuery('') }, [])
  const handleClose = useCallback(() => setOpen(false), [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
        setQuery('')
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const filtered = query.trim()
    ? NAV_ITEMS.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.keywords?.toLowerCase().includes(query.toLowerCase())
      )
    : NAV_ITEMS

  const navigate = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="hidden sm:flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
        title="Search (⌘K)"
      >
        <span>🔍</span>
        <span>Search…</span>
        <kbd className="ml-1 rounded border border-border bg-background px-1 text-xs">⌘K</kbd>
      </button>
    )
  }

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
            onKeyDown={e => {
              if (e.key === 'Enter' && filtered.length > 0) navigate(filtered[0].href)
            }}
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">No results</div>
          ) : (
            filtered.map(item => (
              <button
                key={item.href}
                onClick={() => navigate(item.href)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-accent/60 transition-colors"
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
