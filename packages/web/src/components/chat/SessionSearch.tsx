'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface SessionResult {
  id: string
  cwd: string
  label?: string | null
  started_at: number
  updated_at: number
  status: string
}

interface SessionSearchProps {
  onClose: () => void
}

export function SessionSearch({ onClose }: SessionSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SessionResult[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/sessions/search?q=${encodeURIComponent(q)}`)
      if (res.ok) {
        const data = await res.json() as { sessions: SessionResult[] }
        setResults(data.sessions ?? [])
      }
    } catch { /**/ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => search(query), 250)
    return () => clearTimeout(timer)
  }, [query, search])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const navigate = (id: string) => {
    onClose()
    router.push(`/chat?resume=${id}`)
  }

  const projectName = (cwd: string) => {
    const parts = cwd.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] || cwd
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl border bg-background shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <span className="text-muted-foreground">🔍</span>
          <input
            autoFocus
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            placeholder="Search past sessions by project or label…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {loading && <div className="px-4 py-3 text-sm text-muted-foreground">Searching…</div>}
          {!loading && query && results.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">No sessions found for &quot;{query}&quot;</div>
          )}
          {!query && (
            <div className="px-4 py-4 text-center text-sm text-muted-foreground">Type to search session history</div>
          )}
          {results.map(s => (
            <button
              key={s.id}
              onClick={() => navigate(s.id)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-accent/60 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{s.label || projectName(s.cwd)}</div>
                <div className="text-xs text-muted-foreground truncate">{s.cwd}</div>
              </div>
              <div className="text-xs text-muted-foreground shrink-0">
                {new Date(s.updated_at < 1e12 ? s.updated_at * 1000 : s.updated_at).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
