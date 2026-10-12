import Link from "next/link"
import { ArrowRight, CircleHelp } from "@/lib/icons"

import { PageHeader } from "@/components/dashboard/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { KPI_DEFINITIONS, getKpiHelpHref } from "@/lib/kpi-definitions"

export const metadata = {
  title: "Industrial KPI guide",
}

export default function KpiHelpPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Help"
        title="Industrial KPI guide"
        description="Understand what each maintenance KPI means, how it is calculated, and what the operator needs to log so the metric stays trustworthy."
      />

      <section className="grid gap-4 xl:grid-cols-2">
        {KPI_DEFINITIONS.map((definition) => (
          <Card key={definition.slug} className="bg-card/80">
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CircleHelp className="size-4 text-primary" />
                    <CardTitle>{definition.label}</CardTitle>
                  </div>
                  <p className="text-sm text-muted-foreground">{definition.shortDescription}</p>
                </div>
                <Badge variant="outline">KPI</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Formula</p>
                <p className="text-sm leading-6 text-foreground">{definition.formula}</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Operator inputs</p>
                <ul className="space-y-1 text-sm leading-6 text-muted-foreground">
                  {definition.operatorInputs.map((input) => (
                    <li key={input}>- {input}</li>
                  ))}
                </ul>
              </div>
              <Link href={getKpiHelpHref(definition.slug)} className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                Open KPI guide
                <ArrowRight className="size-4" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
