'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Auto-refreshes the current page every `intervalMs` milliseconds.
 * Uses router.refresh() which re-fetches server component data without full navigation.
 *
 * @param intervalMs - Refresh interval in milliseconds (default: 30000 = 30s)
 * @param enabled - Whether auto-refresh is active (default: true)
 */
export function useAutoRefresh(intervalMs = 30_000, enabled = true) {
  const router = useRouter()
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(() => {
    router.refresh()
  }, [router])

  useEffect(() => {
    if (!enabled) return
    timerRef.current = setInterval(refresh, intervalMs)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [enabled, intervalMs, refresh])

  return { refresh }
}
