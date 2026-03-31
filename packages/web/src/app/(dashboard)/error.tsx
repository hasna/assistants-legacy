"use client"

import { useEffect } from "react"
import { ErrorState } from "@/components/dashboard/error-state"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Dashboard error:", error)
  }, [error])

  return (
    <ErrorState
      title="Page error"
      description={error.message || "An unexpected error occurred."}
      retry={reset}
    />
  )
}
