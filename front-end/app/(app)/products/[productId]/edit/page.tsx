import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "@/lib/icons"

import { PageHeader } from "@/components/dashboard/page-header"
import { ProductForm } from "@/components/products/product-form"
import { Button } from "@/components/ui/button"
import { getProduct, getProducts } from "@/lib/api"

export const metadata: Metadata = {
  title: "Edit product",
}

export default async function EditProductPage(props: PageProps<"/products/[productId]/edit">) {
  const { productId } = await props.params
  const [product, products] = await Promise.all([Number.isInteger(Number(productId)) ? getProduct(Number(productId)) : null, getProducts()])

  if (!product) {
    notFound()
  }

  const categories = Array.from(new Set(products.map((item) => item.category).filter((value): value is string => Boolean(value))))

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Catalogue"
        title={`Edit ${product.name}`}
        description="Change the product's identity, specifications, colour or documents."
        actions={
          <Button asChild variant="outline">
            <Link href={`/products/${product.id}`}>
              <ArrowLeft className="size-4" />
              Back to product
            </Link>
          </Button>
        }
      />
      <ProductForm product={product} categories={categories} />
    </div>
  )
}
