import Link from "next/link"
import { CircleHelp } from "@/lib/icons"

import type { DashboardStat } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function KPIStatCard({ label, value, helper, helpHref, fallbackLabel }: DashboardStat) {
  return (
    <Card className="bg-card/80">
      <CardContent className="space-y-2 py-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">{label}</p>
          {helpHref ? (
            <Button asChild variant="ghost" size="icon-xs">
              <Link href={helpHref} aria-label={`Learn more about ${label}`} title={`Learn more about ${label}`}>
                <CircleHelp className="size-3.5" />
              </Link>
            </Button>
          ) : null}
        </div>
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground">{helper}</p>
        {fallbackLabel ? <p className="text-xs text-amber-600 dark:text-amber-400">{fallbackLabel}</p> : null}
      </CardContent>
    </Card>
  )
}
