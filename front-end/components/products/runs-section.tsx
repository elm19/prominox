"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { deleteRun, productExportUrl, type ProcessOption } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { formatDateTime, formatHours, formatQuantity } from "@/lib/format"
import { ArrowRight, Download, Plus } from "@/lib/icons"
import { EmptyState } from "@/components/dashboard/empty-state"
import { RunForm } from "@/components/products/run-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import type { Product, ProductionRun } from "@/lib/types"

export function RunsSection({ product, runs, processes }: { product: Product; runs: ProductionRun[]; processes: ProcessOption[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [showForm, setShowForm] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const remove = async (run: ProductionRun) => {
    if (!window.confirm(`Delete the record of batch "${run.batchNumber}" and its ${run.stepCount} step execution(s)?`)) return
    setBusy(true)
    try {
      await deleteRun(product.id, run.id)
      toast({ title: "Production run deleted", description: run.batchNumber })
      router.refresh()
    } catch (error) {
      toast({ title: "Could not delete run", description: describeError(error), tone: "error" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="bg-card/80">
      <CardHeader className="gap-3 md:flex md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Production history</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Past runs of this product and how each step was executed. This is the dataset exported for AI training.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={productExportUrl.runs(product.id)} download>
              <Download className="size-4" />
              Runs CSV
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={productExportUrl.runSteps(product.id)} download>
              <Download className="size-4" />
              Step executions CSV
            </a>
          </Button>
          <Button onClick={() => setShowForm((current) => !current)} variant={showForm ? "outline" : "default"} size="sm">
            <Plus className="size-4" />
            {showForm ? "Cancel" : "Record a run"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm ? (
          <RunForm
            product={product}
            processes={processes}
            onDone={() => {
              setShowForm(false)
              router.refresh()
            }}
          />
        ) : null}
        {runs.length === 0 ? (
          <EmptyState title="No production recorded" description="Record past runs to build the history: batch, dates, quantities and the executed steps." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/70">
                  <th className="px-3 py-3 font-medium">Batch</th>
                  <th className="px-3 py-3 font-medium">Period</th>
                  <th className="px-3 py-3 font-medium">Lead time</th>
                  <th className="px-3 py-3 font-medium">Produced</th>
                  <th className="px-3 py-3 font-medium">Scrap</th>
                  <th className="px-3 py-3 font-medium">Yield</th>
                  <th className="px-3 py-3 font-medium">Steps</th>
                  <th className="px-3 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-border/50 last:border-b-0 hover:bg-muted/30">
                    <td className="px-3 py-3">
                      <Link href={`/products/${product.id}/runs/${run.id}`} className="font-medium text-primary">
                        {run.batchNumber}
                      </Link>
                      {run.customerOrder ? <p className="text-xs text-muted-foreground">{run.customerOrder}</p> : null}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">{formatDateTime(run.startedAt)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatHours(run.leadTimeHours)}</td>
                    <td className="px-3 py-3 tabular-nums">
                      {formatQuantity(run.quantityProduced)} {product.unit}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{formatQuantity(run.quantityScrap)}</td>
                    <td className="px-3 py-3 tabular-nums">{run.yieldPct !== null ? `${run.yieldPct.toFixed(1)}%` : "-"}</td>
                    <td className="px-3 py-3">{run.stepCount}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <Link href={`/products/${product.id}/runs/${run.id}`} className="inline-flex items-center gap-1 text-primary">
                          Details <ArrowRight className="size-4" />
                        </Link>
                        <Button size="xs" variant="destructive" onClick={() => remove(run)} disabled={busy}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
