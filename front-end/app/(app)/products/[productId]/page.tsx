import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Download, FilePdf, Flag } from "@/lib/icons"

import { EmptyState } from "@/components/dashboard/empty-state"
import { KPIStatCard } from "@/components/dashboard/kpi-stat-card"
import { PageHeader } from "@/components/dashboard/page-header"
import { ImageGallery } from "@/components/processes/image-gallery"
import { RunsSection } from "@/components/products/runs-section"
import { StepManager } from "@/components/products/step-manager"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs } from "@/components/ui/tabs"
import { getProcessOptions, getProduct, getProductRuns, productExportUrl } from "@/lib/api"
import { formatBytes, formatDateTime, formatHours, formatQuantity } from "@/lib/format"

export async function generateMetadata(props: PageProps<"/products/[productId]">): Promise<Metadata> {
  const { productId } = await props.params
  const product = Number.isInteger(Number(productId)) ? await getProduct(Number(productId)) : null
  return { title: product?.name ?? "Product not found" }
}

export default async function ProductDetailPage(props: PageProps<"/products/[productId]">) {
  const { productId } = await props.params
  const id = Number(productId)
  const product = Number.isInteger(id) ? await getProduct(id) : null

  if (!product) {
    notFound()
  }

  const [processes, runs] = await Promise.all([getProcessOptions(), getProductRuns(product.id)])
  const images = product.files.filter((file) => file.kind === "image")
  const documents = product.files.filter((file) => file.kind === "pdf")
  const { stats } = product
  const finalSteps = product.steps.filter((step) => step.isFinal)

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`${product.reference} · rev ${product.revision}`}
        title={product.name}
        description={product.description || "Product definition, routing through the factory processes, and production history."}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/products">
                <ArrowLeft className="size-4" />
                Back to products
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href={productExportUrl.runSteps(product.id)} download>
                <Download className="size-4" />
                Export CSV
              </a>
            </Button>
            <Button asChild>
              <Link href={`/products/${product.id}/edit`}>Edit</Link>
            </Button>
          </>
        }
      />

      <Tabs
        items={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <div className="space-y-8">
      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="overflow-hidden bg-card/80">
          <div className="h-1.5" style={{ backgroundColor: product.color }} />
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Identity</CardTitle>
              <Badge variant={product.status === "active" ? "success" : "outline"} className="capitalize">
                {product.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {[
                ["Reference", product.reference],
                ["Revision", product.revision],
                ["Category", product.category],
                ["Unit", product.unit],
                ["Material / grade", product.material],
                ["Standard", product.standard],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-1 font-medium">{value || "-"}</dd>
                </div>
              ))}
            </dl>
            {finalSteps.length > 0 ? (
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/70 pt-4 text-sm">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white" style={{ backgroundColor: product.color }}>
                  <Flag className="size-3" />
                  Cycle ends at
                </span>
                {finalSteps.map((step) => (
                  <span key={step.id} className="font-medium">
                    {step.name} <span className="font-normal text-muted-foreground">({step.processName})</span>
                  </span>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="bg-card/80">
          <CardHeader>
            <CardTitle>Specifications</CardTitle>
          </CardHeader>
          <CardContent>
            {product.specs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No specifications. Add dimensions, weight or tolerances from the edit page.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <tbody>
                  {product.specs.map((spec) => (
                    <tr key={spec.id} className="border-b border-border/50 last:border-b-0">
                      <td className="py-2 pr-4 text-muted-foreground">{spec.name}</td>
                      <td className="py-2 font-medium tabular-nums">
                        {spec.value} {spec.unit ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KPIStatCard label="Production runs" value={String(stats.runCount)} helper={stats.lastRunAt ? `Last started ${formatDateTime(stats.lastRunAt)}` : "No run recorded yet"} />
        <KPIStatCard label="Produced" value={`${formatQuantity(stats.totalProduced)}`} helper={`${product.unit} over all runs`} />
        <KPIStatCard label="Scrap" value={formatQuantity(stats.totalScrap)} helper={`${product.unit} lost over all runs`} />
        <KPIStatCard label="Yield" value={stats.yieldPct !== null ? `${stats.yieldPct.toFixed(1)}%` : "-"} helper="Good units out of all units started" />
        <KPIStatCard label="Avg lead time" value={stats.avgLeadTimeHours !== null ? formatHours(stats.avgLeadTimeHours) : "-"} helper="From start to finish of a run" />
      </section>

              </div>
            ),
          },
          {
            id: "routing",
            label: "Routing",
            badge: product.steps.length,
            content: (
              <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Routing</h2>
          <p className="text-sm text-muted-foreground">The path through the factory processes. It is drawn in this product&apos;s colour on the factory map.</p>
        </div>
        <StepManager product={product} processes={processes} />
      </section>

              </div>
            ),
          },
          {
            id: "files",
            label: "Images & documents",
            badge: product.files.length,
            content: (
              <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Images</h2>
          <p className="text-sm text-muted-foreground">Photos of the product.</p>
        </div>
        <ImageGallery images={images} processName={product.name} emptyDescription="Add photos of this product from the edit page." />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Documents</h2>
          <p className="text-sm text-muted-foreground">Drawings, datasheets and certificates.</p>
        </div>
        {documents.length === 0 ? (
          <EmptyState title="No documents yet" description="Attach PDF files from the edit page." icon={<FilePdf className="size-5 text-muted-foreground" />} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {documents.map((file) => (
              <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 border border-border/70 bg-card/80 p-4 transition-colors hover:border-primary/50">
                <FilePdf className="size-8 shrink-0 text-rose-500" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{file.filename}</span>
                  <span className="text-xs text-muted-foreground">PDF · {formatBytes(file.sizeBytes)}</span>
                </span>
              </a>
            ))}
          </div>
        )}
      </section>

              </div>
            ),
          },
          {
            id: "production",
            label: "Production",
            badge: runs.length,
            content: (
                    <RunsSection product={product} runs={runs} processes={processes} />
            ),
          },
        ]}
      />
    </div>
  )
}
