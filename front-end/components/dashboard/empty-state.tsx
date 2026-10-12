import type { ReactNode } from "react"
import { CircleDashed } from "@/lib/icons"

import { Card, CardContent } from "@/components/ui/card"

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string
  description: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-start gap-4 py-10">
        <div className="rounded-xl border border-border bg-muted/60 p-3">
          {icon ?? <CircleDashed className="size-5 text-muted-foreground" />}
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  )
}
