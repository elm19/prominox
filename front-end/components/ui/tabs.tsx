"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export type TabItem = {
  id: string
  label: string
  badge?: string | number
  content: React.ReactNode
}

export function Tabs({ items, defaultId, className }: { items: TabItem[]; defaultId?: string; className?: string }) {
  const [active, setActive] = React.useState(defaultId ?? items[0]?.id)
  const current = items.find((item) => item.id === active) ?? items[0]

  return (
    <div className={cn("space-y-6", className)}>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border/70">
        {items.map((item) => {
          const selected = item.id === current?.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`panel-${item.id}`}
              onClick={() => setActive(item.id)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                selected ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
              {item.badge !== undefined ? <span className="bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">{item.badge}</span> : null}
            </button>
          )
        })}
      </div>
      {current ? (
        <div role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`tab-${current.id}`}>
          {current.content}
        </div>
      ) : null}
    </div>
  )
}
