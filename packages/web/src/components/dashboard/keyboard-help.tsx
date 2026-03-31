"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const shortcuts = [
  { keys: ["⌘", "K"], description: "Open command palette" },
  { keys: ["⌘", "N"], description: "New chat" },
  { keys: ["⌘", "/"], description: "Toggle keyboard shortcuts" },
  { keys: ["Esc"], description: "Close dialog / palette" },
  { keys: ["J"], description: "Next row (in tables)" },
  { keys: ["K"], description: "Previous row (in tables)" },
  { keys: ["↑", "↓"], description: "Navigate command palette" },
  { keys: ["Enter"], description: "Select / confirm" },
]

export function KeyboardHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {shortcuts.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
            >
              <span className="text-sm text-muted-foreground">
                {s.description}
              </span>
              <div className="flex items-center gap-1">
                {s.keys.map((key, j) => (
                  <kbd
                    key={j}
                    className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Press <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘/</kbd> to toggle this panel
        </p>
      </DialogContent>
    </Dialog>
  )
}
