import type { ReactNode } from "react"

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div className="min-w-0 space-y-2">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        ) : null}
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center justify-start gap-3 lg:justify-end">{actions}</div> : null}
    </div>
  )
}
