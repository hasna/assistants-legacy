import { AlertCircle } from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface ErrorStateProps {
  icon?: LucideIcon
  title?: string
  description?: string
  retry?: () => void
}

export function ErrorState({
  icon: Icon = AlertCircle,
  title = "Something went wrong",
  description = "An error occurred while loading this page.",
  retry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-red-50 p-4 mb-4">
        <Icon className="h-8 w-8 text-red-500" />
      </div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
      {retry && (
        <button
          onClick={retry}
          className="mt-4 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-all duration-150"
        >
          Try again
        </button>
      )}
    </div>
  )
}
