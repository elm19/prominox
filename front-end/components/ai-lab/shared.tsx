"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export const selectClass = "h-9 w-full min-w-0 border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring"

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

export function Note({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" | "error" }) {
  return (
    <p
      className={cn(
        "border px-4 py-3 text-sm",
        tone === "error" ? "border-rose-500/40 bg-rose-500/10" : tone === "warn" ? "border-amber-500/40 bg-amber-500/10" : "border-border/70 bg-muted/40 text-muted-foreground"
      )}
    >
      {children}
    </p>
  )
}

export function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 border-l-2 border-border pl-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="truncate text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function Explain({ children }: { children: React.ReactNode }) {
  return (
    <details className="border border-border/70 bg-card/60 px-4 py-2 text-sm text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">How does this work?</summary>
      <div className="mt-2 space-y-2 leading-6">{children}</div>
    </details>
  )
}

const statusMap = {
  healthy: { label: "Healthy", variant: "success" },
  observe: { label: "Watch", variant: "warning" },
  service_soon: { label: "Service soon", variant: "danger" },
} as const

export function RiskBadge({ status }: { status: keyof typeof statusMap }) {
  const item = statusMap[status]
  return <Badge variant={item.variant}>{item.label}</Badge>
}

export const tooltipStyle = { borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-card)", fontSize: 12 }
export const fmtDate = (value: string) => new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
