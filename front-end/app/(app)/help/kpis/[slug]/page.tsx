import type { Metadata } from "next"
import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, BookOpenCheck } from "@/lib/icons"
import { notFound } from "next/navigation"

import { EmptyState } from "@/components/dashboard/empty-state"
import { PageHeader } from "@/components/dashboard/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { KPI_DEFINITIONS, KPI_HELP_PATH } from "@/lib/kpi-definitions"
import type { KpiSlug } from "@/lib/types"

function Fraction({ numerator, denominator }: { numerator: ReactNode; denominator: ReactNode }) {
  return (
    <span className="inline-grid min-w-40 align-middle text-center">
      <span className="border-b border-foreground/80 px-3 pb-1">{numerator}</span>
      <span className="px-3 pt-1">{denominator}</span>
    </span>
  )
}

function KpiFormula({ slug, fallback }: { slug: KpiSlug; fallback: string }) {
  const formulas: Record<KpiSlug, ReactNode> = {
    availability: (
      <>
        <span>Availability (%)</span>
        <span>=</span>
        <Fraction numerator="Scheduled hours - Downtime hours" denominator="Scheduled hours" />
        <span>&times;</span>
        <span>100</span>
      </>
    ),
    mtbf: (
      <>
        <span>MTBF (hours)</span>
        <span>=</span>
        <Fraction numerator="Runtime hours" denominator="Failure event count" />
      </>
    ),
    mttr: (
      <>
        <span>MTTR (hours)</span>
        <span>=</span>
        <Fraction numerator="Total repair downtime" denominator="Failure event count" />
      </>
    ),
    "downtime-hours": (
      <>
        <span>Downtime hours</span>
        <span>=</span>
        <span className="inline-flex items-center gap-2">
          <span className="text-2xl leading-none">&sum;</span>
          <span>Downtime hours from maintenance logs</span>
        </span>
      </>
    ),
    "planned-maintenance-ratio": (
      <>
        <span>Planned maintenance ratio (%)</span>
        <span>=</span>
        <Fraction numerator="Planned maintenance logs" denominator="Total maintenance logs" />
        <span>&times;</span>
        <span>100</span>
      </>
    ),
    "failure-rate": (
      <>
        <span>Failure rate</span>
        <span>=</span>
        <Fraction numerator="Failure events" denominator="Runtime hours" />
        <span>&times;</span>
        <span>100</span>
      </>
    ),
    "telemetry-coverage": (
      <>
        <span>Telemetry coverage (%)</span>
        <span>=</span>
        <Fraction numerator="Sensors with at least one reading" denominator="Configured sensors" />
        <span>&times;</span>
        <span>100</span>
      </>
    ),
  }

  return (
    <div
      aria-label={fallback}
      className="overflow-x-auto rounded-lg border border-border/70 bg-background/70 p-4"
    >
      <div aria-hidden="true" className="flex min-w-max items-center gap-3 text-sm font-medium text-foreground">
        {formulas[slug]}
      </div>
    </div>
  )
}

export async function generateMetadata(props: PageProps<"/help/kpis/[slug]">): Promise<Metadata> {
  const { slug } = await props.params
  const definition = KPI_DEFINITIONS.find((item) => item.slug === slug)

  return {
    title: definition?.label ?? "KPI detail",
  }
}

export default async function KpiHelpDetailPage(props: PageProps<"/help/kpis/[slug]">) {
  const { slug } = await props.params
  const definition = KPI_DEFINITIONS.find((item) => item.slug === slug)

  if (!definition) {
    notFound()
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="KPI detail"
        title={definition.label}
        description={definition.shortDescription}
        actions={
          <Button asChild variant="outline">
            <Link href={KPI_HELP_PATH}>
              <ArrowLeft className="size-4" />
              Back to KPI guide
            </Link>
          </Button>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-card/80">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <BookOpenCheck className="size-4 text-primary" />
              <CardTitle>How to read this KPI</CardTitle>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{definition.whyItMatters}</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Formula</p>
              <KpiFormula slug={definition.slug} fallback={definition.formula} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Interpretation</p>
              <ul className="space-y-1 text-sm leading-6 text-muted-foreground">
                {definition.interpretation.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="bg-card/80">
            <CardHeader>
              <CardTitle>What the operator should log</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {definition.operatorInputs.map((input) => (
                <div key={input} className="rounded-lg border border-border/70 bg-background/70 p-3 text-sm text-muted-foreground">
                  {input}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-card/80">
            <CardHeader>
              <CardTitle>Fallback behavior</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="mb-3">
                Data quality note
              </Badge>
              <p className="text-sm leading-6 text-muted-foreground">{definition.fallbackBehavior}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <EmptyState
        title="Need a broader KPI refresher?"
        description="Open the full KPI guide to compare formulas, inputs, and reliability tradeoffs side by side."
        action={
          <Button asChild>
            <Link href={KPI_HELP_PATH}>Open KPI guide</Link>
          </Button>
        }
      />
    </div>
  )
}
