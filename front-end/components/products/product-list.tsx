"use client"

import * as React from "react"
import Link from "next/link"

import { Package, Search } from "@/lib/icons"
import { EmptyState } from "@/components/dashboard/empty-state"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { ProductStatus, ProductSummary } from "@/lib/types"

const filters: Array<ProductStatus | "all"> = ["all", "active", "archived"]

export function ProductList({ products }: { products: ProductSummary[] }) {
  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState<ProductStatus | "all">("all")

  const filtered = products.filter((product) => {
    const text = `${product.name} ${product.reference} ${product.category ?? ""}`.toLowerCase()
    return text.includes(query.toLowerCase()) && (status === "all" || product.status === status)
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name, reference, or category" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatus(filter)}
              className={`rounded-lg border px-3 py-2 text-sm capitalize ${status === filter ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No products found" description={products.length ? "No product matches the current filters." : "Create the first product to model its routing through the factory."} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => (
            <Link key={product.id} href={`/products/${product.id}`} className="group block">
              <Card className={`h-full overflow-hidden bg-card/80 transition-colors group-hover:border-primary/50 ${product.status === "archived" ? "opacity-70" : ""}`}>
                <div className="h-1.5" style={{ backgroundColor: product.color }} />
                <CardContent className="space-y-4 pt-5">
                  <div className="flex items-start gap-4">
                    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden border border-border/70 bg-muted">
                      {product.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
                      ) : (
                        <Package className="size-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{product.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {product.reference} · rev {product.revision}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {product.category ? <Badge variant="outline">{product.category}</Badge> : null}
                        {product.status === "archived" ? <Badge variant="outline">Archived</Badge> : null}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="border border-border/70 bg-background/70 p-2">
                      <p className="text-lg font-semibold tabular-nums">{product.stepCount}</p>
                      <p className="text-xs text-muted-foreground">steps</p>
                    </div>
                    <div className="border border-border/70 bg-background/70 p-2">
                      <p className="text-lg font-semibold tabular-nums">{product.processCount}</p>
                      <p className="text-xs text-muted-foreground">processes</p>
                    </div>
                    <div className="border border-border/70 bg-background/70 p-2">
                      <p className="text-lg font-semibold tabular-nums">{product.runCount}</p>
                      <p className="text-xs text-muted-foreground">runs</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
