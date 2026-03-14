'use client'

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 border-b bg-muted/30">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className={`h-3 rounded bg-muted animate-pulse ${i === 0 ? 'w-12' : i === 1 ? 'w-48' : 'w-20'}`} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4 px-4 py-3 border-b last:border-0">
          <div className="h-3 w-3 rounded-sm bg-muted animate-pulse mt-0.5 shrink-0" />
          {Array.from({ length: cols - 1 }).map((_, col) => (
            <div
              key={col}
              className={`h-3 rounded bg-muted animate-pulse ${
                col === 0 ? 'w-16' :
                col === 1 ? `w-${['32', '48', '56', '40'][row % 4]}` :
                col === 2 ? 'w-20' : 'w-24'
              }`}
              style={{ animationDelay: `${(row * cols + col) * 30}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
