import Link from "next/link"
import { Download, Plus } from "@/lib/icons"

import { PageHeader } from "@/components/dashboard/page-header"
import { ProductList } from "@/components/products/product-list"
import { Button } from "@/components/ui/button"
import { getProducts, productExportUrl } from "@/lib/api"

export const metadata = {
  title: "Products",
}

export default async function ProductsPage() {
  const products = await getProducts()

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        description="What the factory makes, how each product flows through the processes, and the history of how it was produced."
        actions={
          <>
            <Button asChild variant="outline">
              <a href={productExportUrl.products()} download>
                <Download className="size-4" />
                Export CSV
              </a>
            </Button>
            <Button asChild>
              <Link href="/products/add">
                <Plus className="size-4" />
                Add product
              </Link>
            </Button>
          </>
        }
      />
      <ProductList products={products} />
    </div>
  )
}
