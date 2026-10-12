"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { createProcess, deleteProcess, deleteProcessImage, updateProcess, uploadProcessImages } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { X } from "@/lib/icons"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Department, Process, ProcessStatus, ProcessType } from "@/lib/types"

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_IMAGES = 10
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"

type PendingImage = { file: File; preview: string }

export function ProcessForm({ departments, process }: { departments: Department[]; process?: Process }) {
  const router = useRouter()
  const { toast } = useToast()
  const editing = Boolean(process)

  const [name, setName] = React.useState(process?.name ?? "")
  const [code, setCode] = React.useState(process?.code.startsWith("PRC-") ? "" : (process?.code ?? ""))
  const [type, setType] = React.useState<ProcessType>(process?.type ?? "machine")
  const [departmentId, setDepartmentId] = React.useState(process?.departmentId ?? departments[0]?.id ?? 0)
  const [capacity, setCapacity] = React.useState(String(process?.capacity ?? 0))
  const [quantity, setQuantity] = React.useState(String(process?.quantity ?? 1))
  const [status, setStatus] = React.useState<ProcessStatus>(process?.status ?? "active")
  const [description, setDescription] = React.useState(process?.description ?? "")
  const [existingImages, setExistingImages] = React.useState(process?.images ?? [])
  const [pending, setPending] = React.useState<PendingImage[]>([])
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  React.useEffect(() => () => pending.forEach((item) => URL.revokeObjectURL(item.preview)), [pending])

  const addFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""
    const problems: string[] = []
    const accepted: PendingImage[] = []
    for (const file of files) {
      if (!IMAGE_TYPES.includes(file.type)) problems.push(`${file.name}: only JPEG, PNG and WebP are allowed`)
      else if (file.size > MAX_IMAGE_BYTES) problems.push(`${file.name}: larger than 5 MB`)
      else if (existingImages.length + pending.length + accepted.length >= MAX_IMAGES) problems.push(`${file.name}: at most ${MAX_IMAGES} images per process`)
      else accepted.push({ file, preview: URL.createObjectURL(file) })
    }
    if (problems.length) toast({ title: "Some images were skipped", description: problems.join(" | "), tone: "error" })
    setPending((current) => [...current, ...accepted])
  }

  const removePending = (index: number) => {
    URL.revokeObjectURL(pending[index].preview)
    setPending((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const removeExisting = async (imageId: number) => {
    if (!process || !window.confirm("Delete this image?")) return
    try {
      await deleteProcessImage(process.id, imageId)
      setExistingImages((current) => current.filter((image) => image.id !== imageId))
      router.refresh()
    } catch (error) {
      toast({ title: "Could not delete image", description: describeError(error), tone: "error" })
    }
  }

  const validate = () => {
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = "Name is required."
    if (!departmentId) next.department = "Choose a department."
    if (!/^\d+$/.test(capacity.trim())) next.capacity = "Capacity must be a whole number, 0 or more."
    if (!/^\d+$/.test(quantity.trim()) || Number(quantity) < 1) next.quantity = "Quantity must be a whole number, 1 or more."
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    let savedId = process?.id
    try {
      const payload = {
        name: name.trim(),
        code: code.trim() || null,
        type,
        department_id: departmentId,
        capacity: Number(capacity),
        quantity: Number(quantity),
        description: description.trim() || null,
        status,
      }
      if (process) await updateProcess(process.id, payload)
      else savedId = (await createProcess(payload)).id

      if (pending.length && savedId !== undefined) {
        try {
          await uploadProcessImages(savedId, pending.map((item) => item.file))
        } catch (error) {
          toast({ title: "Process saved, but images failed", description: describeError(error), tone: "error" })
          router.push(`/processes/${savedId}/edit`)
          router.refresh()
          return
        }
      }
      toast({ title: editing ? "Process updated" : "Process created", description: name.trim() })
      router.push(`/processes/${savedId}`)
      router.refresh()
    } catch (error) {
      toast({ title: editing ? "Could not update process" : "Could not create process", description: describeError(error), tone: "error" })
      setIsSubmitting(false)
    }
  }

  const remove = async () => {
    if (!process || !window.confirm(`Delete "${process.name}" with its sensors, readings, images and maintenance logs? This cannot be undone.`)) return
    setIsSubmitting(true)
    try {
      await deleteProcess(process.id)
      toast({ title: "Process deleted", description: process.name })
      router.push("/processes")
      router.refresh()
    } catch (error) {
      toast({ title: "Could not delete process", description: describeError(error), tone: "error" })
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="bg-card/80">
      <CardHeader>
        <CardTitle>{editing ? "Edit process" : "Add process"}</CardTitle>
        <p className="text-sm text-muted-foreground">
          A process is something that runs in the factory, performed by a person or by a machine. Sensors are defined afterwards on the process page.
        </p>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={submit} noValidate>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="process-name">Process name</Label>
              <Input id="process-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Plate cutting" aria-invalid={Boolean(errors.name)} />
              {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="process-code">Process code (optional)</Label>
              <Input id="process-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="CUT-02" />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <div className="inline-flex h-8 rounded-lg border border-border bg-background p-0.5" role="radiogroup" aria-label="Process type">
                {(["machine", "manual"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={type === option}
                    onClick={() => setType(option)}
                    className={`rounded-md px-4 text-sm font-medium capitalize transition-colors ${type === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Machine: performed by a machine. Manual: performed by a person.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="process-department">Department (location)</Label>
              <select id="process-department" value={departmentId} onChange={(event) => setDepartmentId(Number(event.target.value))} className={selectClass}>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
              {errors.department ? <p className="text-xs text-destructive">{errors.department}</p> : null}
              <p className="text-xs text-muted-foreground">
                Where the process is located. Missing one? <Link href="/departments" className="text-primary underline">Manage departments</Link>.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="process-capacity">Capacity</Label>
              <Input id="process-capacity" inputMode="numeric" value={capacity} onChange={(event) => setCapacity(event.target.value)} aria-invalid={Boolean(errors.capacity)} />
              {errors.capacity ? <p className="text-xs text-destructive">{errors.capacity}</p> : null}
              <p className="text-xs text-muted-foreground">Whole number, 0 or more. Use <strong>0 for dynamic</strong> (no fixed limit); a positive number is a fixed capacity.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="process-quantity">Quantity</Label>
              <Input id="process-quantity" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-invalid={Boolean(errors.quantity)} />
              {errors.quantity ? <p className="text-xs text-destructive">{errors.quantity}</p> : null}
              <p className="text-xs text-muted-foreground">How many instances of this process can run in parallel in the factory (at least 1).</p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Status</Label>
              <div className="inline-flex h-8 rounded-lg border border-border bg-background p-0.5" role="radiogroup" aria-label="Process status">
                {(["active", "inactive"] as const).map((option) => (
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
              <p className="text-xs text-muted-foreground">Active: the process currently exists in the factory. Inactive: disabled, it does not exist there.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="process-description">Description</Label>
            <Textarea id="process-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this process does, its inputs and outputs, safety context." />
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="process-images">Images</Label>
              <p className="mt-1 text-sm text-muted-foreground">JPEG, PNG or WebP, up to 5 MB each, at most {MAX_IMAGES} per process.</p>
            </div>
            <Input id="process-images" type="file" accept={IMAGE_TYPES.join(",")} multiple onChange={addFiles} />
            {existingImages.length + pending.length > 0 ? (
              <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
                {existingImages.map((image) => (
                  <div key={image.id} className="relative aspect-square overflow-hidden border border-border/70">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt={image.filename} className="size-full object-cover" />
                    <Button type="button" size="icon-xs" variant="secondary" className="absolute top-1 right-1" onClick={() => removeExisting(image.id)} aria-label={`Delete ${image.filename}`}>
                      <X className="size-3" />
                    </Button>
                  </div>
                ))}
                {pending.map((item, index) => (
                  <div key={item.preview} className="relative aspect-square overflow-hidden border border-dashed border-primary/60">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.preview} alt={item.file.name} className="size-full object-cover" />
                    <span className="absolute bottom-0 left-0 bg-primary px-1.5 text-[10px] text-primary-foreground">New</span>
                    <Button type="button" size="icon-xs" variant="secondary" className="absolute top-1 right-1" onClick={() => removePending(index)} aria-label={`Remove ${item.file.name}`}>
                      <X className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : editing ? "Save changes" : "Create process"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push(process ? `/processes/${process.id}` : "/processes")}>
              Cancel
            </Button>
            {process ? (
              <Button type="button" variant="destructive" className="ml-auto" onClick={remove} disabled={isSubmitting}>
                Delete process
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
