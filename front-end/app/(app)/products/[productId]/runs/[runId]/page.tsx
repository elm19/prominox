import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Download, Flag } from "@/lib/icons"

import { KPIStatCard } from "@/components/dashboard/kpi-stat-card"
import { PageHeader } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getProduct, getProductRun, productExportUrl } from "@/lib/api"
import { formatDateTime, formatHours, formatMinutes, formatQuantity } from "@/lib/format"

export const metadata: Metadata = {
  title: "Production run",
}

export default async function ProductionRunPage(props: PageProps<"/products/[productId]/runs/[runId]">) {
  const { productId, runId } = await props.params
  const valid = Number.isInteger(Number(productId)) && Number.isInteger(Number(runId))
  const [product, run] = valid ? await Promise.all([getProduct(Number(productId)), getProductRun(Number(productId), Number(runId))]) : [null, null]

  if (!product || !run) {
    notFound()
  }

  const finalStepIds = new Set(product.steps.filter((step) => step.isFinal).map((step) => step.id))
  const standardOf = new Map(product.steps.map((step) => [step.id, step.standardDurationMinutes]))

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`${product.reference} · production run`}
        title={`Batch ${run.batchNumber}`}
        description={`${product.name}${run.customerOrder ? ` · order ${run.customerOrder}` : ""}${run.notes ? ` · ${run.notes}` : ""}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/products/${product.id}`}>
                <ArrowLeft className="size-4" />
                Back to product
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href={productExportUrl.runSteps(product.id)} download>
                <Download className="size-4" />
                Export CSV
              </a>
            </Button>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KPIStatCard label="Produced" value={`${formatQuantity(run.quantityProduced)} ${product.unit}`} helper={`${formatQuantity(run.quantityScrap)} scrapped`} />
        <KPIStatCard label="Yield" value={run.yieldPct !== null ? `${run.yieldPct.toFixed(1)}%` : "-"} helper="Good units out of all units started" />
        <KPIStatCard label="Lead time" value={formatHours(run.leadTimeHours)} helper={`${formatDateTime(run.startedAt)} to ${formatDateTime(run.endedAt)}`} />
        <KPIStatCard label="Steps executed" value={String(run.stepCount)} helper={`${product.stepCount} in the routing`} />
      </section>

      <Card className="bg-card/80">
        <CardHeader>
          <CardTitle>Step executions</CardTitle>
          <p className="text-sm text-muted-foreground">Actual time is compared with the standard time per unit of the routing step, scaled by the quantity processed.</p>
        </CardHeader>
        <CardContent>
          {run.steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No step executions were recorded for this run.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border/70">
                    <th className="px-3 py-3 font-medium">Step</th>
                    <th className="px-3 py-3 font-medium">Process</th>
                    <th className="px-3 py-3 font-medium">Period</th>
                    <th className="px-3 py-3 font-medium">Actual</th>
                    <th className="px-3 py-3 font-medium">Expected</th>
                    <th className="px-3 py-3 font-medium">In</th>
                    <th className="px-3 py-3 font-medium">Out</th>
                    <th className="px-3 py-3 font-medium">Scrap</th>
                    <th className="px-3 py-3 font-medium">Operator</th>
                  </tr>
                </thead>
                <tbody>
                  {run.steps.map((step) => {
                    const standard = step.productStepId !== null ? standardOf.get(step.productStepId) : null
                    const expected = standard ? standard * step.quantityIn : null
                    const slow = expected !== null && step.durationMinutes > expected * 1.2
                    return (
                      <tr key={step.id} className="border-b border-border/50 last:border-b-0">
                        <td className="px-3 py-3 font-medium">
                          {step.stepName}
                          {step.productStepId !== null && finalStepIds.has(step.productStepId) ? (
                            <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wider text-white" style={{ backgroundColor: product.color }}>
                              <Flag className="size-3" />
                              End
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <Link href={`/processes/${step.processId}`} className="text-primary">
                            {step.processName}
                          </Link>
                          {step.instance ? <span className="ml-1 text-xs text-muted-foreground">#{step.instance}</span> : null}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                          {formatDateTime(step.startedAt)}
                          <br />
                          <span className="text-xs">to {formatDateTime(step.endedAt)}</span>
                        </td>
                        <td className={`px-3 py-3 whitespace-nowrap tabular-nums ${slow ? "text-amber-500" : ""}`}>{formatMinutes(step.durationMinutes)}</td>
                        <td className="px-3 py-3 whitespace-nowrap tabular-nums text-muted-foreground">{expected !== null ? formatMinutes(expected) : "-"}</td>
                        <td className="px-3 py-3 tabular-nums">{formatQuantity(step.quantityIn)}</td>
                        <td className="px-3 py-3 tabular-nums">{formatQuantity(step.quantityOut)}</td>
                        <td className="px-3 py-3 tabular-nums">{formatQuantity(step.quantityScrap)}</td>
                        <td className="px-3 py-3">{step.operator ?? "-"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
