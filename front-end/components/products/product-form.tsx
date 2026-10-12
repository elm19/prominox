"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { createProduct, deleteProduct, deleteProductFile, updateProduct, uploadProductFiles } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { FilePdf, Plus, X } from "@/lib/icons"
import { formatBytes } from "@/lib/format"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Product, ProductStatus } from "@/lib/types"

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_PDF_BYTES = 20 * 1024 * 1024
const FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
const COLORS = ["#38bdf8", "#f59e0b", "#34d399", "#a78bfa", "#fb7185", "#14b8a6", "#f97316", "#facc15"]
const SPEC_SUGGESTIONS = ["Outer diameter", "Wall thickness", "Length", "Width", "Thickness", "Weight", "Tolerance"]

type SpecRow = { name: string; value: string; unit: string }
type PendingFile = { file: File; preview: string | null }

export function ProductForm({ product, categories }: { product?: Product; categories: string[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const editing = Boolean(product)

  const [reference, setReference] = React.useState(product?.reference ?? "")
  const [name, setName] = React.useState(product?.name ?? "")
  const [category, setCategory] = React.useState(product?.category ?? "")
  const [material, setMaterial] = React.useState(product?.material ?? "")
  const [standard, setStandard] = React.useState(product?.standard ?? "")
  const [unit, setUnit] = React.useState(product?.unit ?? "piece")
  const [revision, setRevision] = React.useState(product?.revision ?? "1")
  const [status, setStatus] = React.useState<ProductStatus>(product?.status ?? "active")
  const [color, setColor] = React.useState(product?.color ?? COLORS[0])
  const [description, setDescription] = React.useState(product?.description ?? "")
  const [specs, setSpecs] = React.useState<SpecRow[]>(
    product?.specs.map((spec) => ({ name: spec.name, value: spec.value, unit: spec.unit ?? "" })) ?? []
  )
  const [existingFiles, setExistingFiles] = React.useState(product?.files ?? [])
  const [pending, setPending] = React.useState<PendingFile[]>([])
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  React.useEffect(() => () => pending.forEach((item) => item.preview && URL.revokeObjectURL(item.preview)), [pending])

  const addFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""
    const problems: string[] = []
    const accepted: PendingFile[] = []
    for (const file of files) {
      const limit = file.type === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES
      if (!FILE_TYPES.includes(file.type)) problems.push(`${file.name}: only JPEG, PNG, WebP and PDF are allowed`)
      else if (file.size > limit) problems.push(`${file.name}: larger than ${limit / (1024 * 1024)} MB`)
      else accepted.push({ file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null })
    }
    if (problems.length) toast({ title: "Some files were skipped", description: problems.join(" | "), tone: "error" })
    setPending((current) => [...current, ...accepted])
  }

  const removePending = (index: number) => {
    const preview = pending[index].preview
    if (preview) URL.revokeObjectURL(preview)
    setPending((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const removeExisting = async (fileId: number) => {
    if (!product || !window.confirm("Delete this file?")) return
    try {
      await deleteProductFile(product.id, fileId)
      setExistingFiles((current) => current.filter((file) => file.id !== fileId))
      router.refresh()
    } catch (error) {
      toast({ title: "Could not delete file", description: describeError(error), tone: "error" })
    }
  }

  const updateSpec = (index: number, patch: Partial<SpecRow>) =>
    setSpecs((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))

  const validate = () => {
    const next: Record<string, string> = {}
    if (!reference.trim()) next.reference = "Reference is required."
    if (!name.trim()) next.name = "Name is required."
    if (!unit.trim()) next.unit = "Unit is required."
    if (!revision.trim()) next.revision = "Revision is required."
    const filled = specs.filter((spec) => spec.name.trim() || spec.value.trim())
    if (filled.some((spec) => !spec.name.trim() || !spec.value.trim())) next.specs = "Each specification needs a name and a value."
    else if (new Set(filled.map((spec) => spec.name.trim().toLowerCase())).size !== filled.length) next.specs = "Specification names must be unique."
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    let savedId = product?.id
    try {
      const payload = {
        reference: reference.trim(),
        name: name.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        material: material.trim() || null,
        standard: standard.trim() || null,
        unit: unit.trim(),
        revision: revision.trim(),
        status,
        color,
        specifications: specs
          .filter((spec) => spec.name.trim() && spec.value.trim())
          .map((spec) => ({ name: spec.name.trim(), value: spec.value.trim(), unit: spec.unit.trim() || null })),
      }
      if (product) await updateProduct(product.id, payload)
      else savedId = (await createProduct(payload)).id

      if (pending.length && savedId !== undefined) {
        try {
          await uploadProductFiles(savedId, pending.map((item) => item.file))
        } catch (error) {
          toast({ title: "Product saved, but files failed", description: describeError(error), tone: "error" })
          router.push(`/products/${savedId}/edit`)
          router.refresh()
          return
        }
      }
      toast({ title: editing ? "Product updated" : "Product created", description: name.trim() })
      router.push(`/products/${savedId}`)
      router.refresh()
    } catch (error) {
      toast({ title: editing ? "Could not update product" : "Could not create product", description: describeError(error), tone: "error" })
      setIsSubmitting(false)
    }
  }

  const remove = async () => {
    if (!product) return
    if (!window.confirm(`Delete "${product.name}" with its routing, files and ${product.runCount} production run(s)? This cannot be undone.`)) return
    setIsSubmitting(true)
    try {
      await deleteProduct(product.id)
      toast({ title: "Product deleted", description: product.name })
      router.push("/products")
      router.refresh()
    } catch (error) {
      toast({ title: "Could not delete product", description: describeError(error), tone: "error" })
      setIsSubmitting(false)
    }
  }

  const fieldError = (key: string) => (errors[key] ? <p className="text-xs text-destructive">{errors[key]}</p> : null)

  return (
    <Card className="bg-card/80">
      <CardHeader>
        <CardTitle>{editing ? "Edit product" : "Add product"}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Describe what is made. The routing (steps through processes) and the production history are added on the product page.
        </p>
      </CardHeader>
      <CardContent>
        <form className="space-y-8" onSubmit={submit} noValidate>
          <section className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-reference">Reference / SKU</Label>
              <Input id="product-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="PIPE-12-W" aria-invalid={Boolean(errors.reference)} />
              {fieldError("reference")}
              <p className="text-xs text-muted-foreground">Unique part number used in orders and exports.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-name">Name</Label>
              <Input id="product-name" value={name} onChange={(event) => setName(event.target.value)} placeholder='Welded steel pipe 12"' aria-invalid={Boolean(errors.name)} />
              {fieldError("name")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-category">Category</Label>
              <Input id="product-category" list="product-categories" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Pipes" />
              <datalist id="product-categories">
                {categories.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-material">Material / grade</Label>
              <Input id="product-material" value={material} onChange={(event) => setMaterial(event.target.value)} placeholder="S235JR" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-standard">Standard / norm</Label>
              <Input id="product-standard" value={standard} onChange={(event) => setStandard(event.target.value)} placeholder="EN 10217-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product-unit">Unit</Label>
                <Input id="product-unit" list="product-units" value={unit} onChange={(event) => setUnit(event.target.value)} aria-invalid={Boolean(errors.unit)} />
                <datalist id="product-units">
                  {["piece", "meter", "kg", "ton", "m2"].map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
                {fieldError("unit")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-revision">Revision</Label>
                <Input id="product-revision" value={revision} onChange={(event) => setRevision(event.target.value)} aria-invalid={Boolean(errors.revision)} />
                {fieldError("revision")}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <div className="inline-flex h-8 rounded-lg border border-border bg-background p-0.5" role="radiogroup" aria-label="Product status">
                {(["active", "archived"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={status === option}
                    onClick={() => setStatus(option)}
                    className={`rounded-md px-4 text-sm font-medium capitalize transition-colors ${status === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Active: in the catalogue. Archived: no longer produced, history is kept.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-color">Colour on the factory map</Label>
              <div className="flex flex-wrap items-center gap-2">
                {COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setColor(option)}
                    aria-label={`Use colour ${option}`}
                    aria-pressed={color === option}
                    className={`size-7 border-2 ${color === option ? "border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: option }}
                  />
                ))}
                <input id="product-color" type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-7 w-10 cursor-pointer border border-border bg-transparent" aria-label="Custom colour" />
              </div>
            </div>
          </section>

          <div className="space-y-2">
            <Label htmlFor="product-description">Description</Label>
            <Textarea id="product-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Intended use, customers, special requirements." />
          </div>

          <section className="space-y-3">
            <div>
              <Label>Specifications</Label>
              <p className="mt-1 text-sm text-muted-foreground">Free-form technical characteristics: dimensions, weight, tolerances...</p>
            </div>
            {specs.map((spec, index) => (
              <div key={index} className="grid grid-cols-[1.2fr_1fr_0.6fr_auto] gap-3">
                <Input value={spec.name} onChange={(event) => updateSpec(index, { name: event.target.value })} placeholder="Name" aria-label="Specification name" />
                <Input value={spec.value} onChange={(event) => updateSpec(index, { value: event.target.value })} placeholder="Value" aria-label="Specification value" />
                <Input value={spec.unit} onChange={(event) => updateSpec(index, { unit: event.target.value })} placeholder="Unit" aria-label="Specification unit" />
                <Button type="button" variant="outline" size="icon-sm" onClick={() => setSpecs((current) => current.filter((_, rowIndex) => rowIndex !== index))} aria-label="Remove specification">
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            {fieldError("specs")}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setSpecs((current) => [...current, { name: "", value: "", unit: "" }])}>
                <Plus className="size-4" />
                Add specification
              </Button>
              {SPEC_SUGGESTIONS.filter((item) => !specs.some((spec) => spec.name === item)).map((item) => (
                <Button key={item} type="button" variant="ghost" size="sm" onClick={() => setSpecs((current) => [...current, { name: item, value: "", unit: "" }])}>
                  + {item}
                </Button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <Label htmlFor="product-files">Images and PDF documents</Label>
              <p className="mt-1 text-sm text-muted-foreground">Photos, drawings, datasheets, certificates. JPEG, PNG, WebP up to 5 MB; PDF up to 20 MB; at most 20 of each.</p>
            </div>
            <Input id="product-files" type="file" accept={FILE_TYPES.join(",")} multiple onChange={addFiles} />
            {existingFiles.length + pending.length > 0 ? (
              <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
                {existingFiles.map((file) => (
                  <div key={file.id} className="relative aspect-square overflow-hidden border border-border/70 bg-muted">
                    {file.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={file.url} alt={file.filename} className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center">
                        <FilePdf className="size-8 text-rose-500" />
                        <span className="line-clamp-2 text-xs">{file.filename}</span>
                        <span className="text-[10px] text-muted-foreground">{formatBytes(file.sizeBytes)}</span>
                      </div>
                    )}
                    <Button type="button" size="icon-xs" variant="secondary" className="absolute top-1 right-1" onClick={() => removeExisting(file.id)} aria-label={`Delete ${file.filename}`}>
                      <X className="size-3" />
                    </Button>
                  </div>
                ))}
                {pending.map((item, index) => (
                  <div key={`${item.file.name}-${index}`} className="relative aspect-square overflow-hidden border border-dashed border-primary/60 bg-muted">
                    {item.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.preview} alt={item.file.name} className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center">
                        <FilePdf className="size-8 text-rose-500" />
                        <span className="line-clamp-2 text-xs">{item.file.name}</span>
                        <span className="text-[10px] text-muted-foreground">{formatBytes(item.file.size)}</span>
                      </div>
                    )}
                    <span className="absolute bottom-0 left-0 bg-primary px-1.5 text-[10px] text-primary-foreground">New</span>
                    <Button type="button" size="icon-xs" variant="secondary" className="absolute top-1 right-1" onClick={() => removePending(index)} aria-label={`Remove ${item.file.name}`}>
                      <X className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : editing ? "Save changes" : "Create product"}
            </Button>
            <Button asChild variant="outline">
              <Link href={product ? `/products/${product.id}` : "/products"}>Cancel</Link>
            </Button>
            {product ? (
              <Button type="button" variant="destructive" className="ml-auto" onClick={remove} disabled={isSubmitting}>
                Delete product
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
