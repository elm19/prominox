import { PageHeader } from "@/components/dashboard/page-header"
import { ProductForm } from "@/components/products/product-form"
import { getProducts } from "@/lib/api"

export const metadata = {
  title: "Add a product",
}

export default async function AddProductPage() {
  const products = await getProducts()
  const categories = Array.from(new Set(products.map((product) => product.category).filter((value): value is string => Boolean(value))))

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Catalogue"
        title="Add a product"
        description="Register a product with its identity, specifications and documents. You will define its routing through the processes next."
      />
      <ProductForm categories={categories} />
    </div>
  )
}
