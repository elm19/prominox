"use client"

import * as React from "react"

import { ArrowLeft, ArrowRight, X } from "@/lib/icons"
import { EmptyState } from "@/components/dashboard/empty-state"
import { Button } from "@/components/ui/button"
import type { ProcessImage } from "@/lib/types"

export function ImageGallery({
  images,
  processName,
  emptyDescription = "Add photos of this process from the edit page to document how it looks on the shop floor.",
}: {
  images: ProcessImage[]
  processName: string
  emptyDescription?: string
}) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(null)

  const close = React.useCallback(() => setOpenIndex(null), [])
  const step = React.useCallback(
    (delta: number) => setOpenIndex((current) => (current === null ? null : (current + delta + images.length) % images.length)),
    [images.length]
  )

  React.useEffect(() => {
    if (openIndex === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
      if (event.key === "ArrowLeft") step(-1)
      if (event.key === "ArrowRight") step(1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openIndex, close, step])

  if (images.length === 0) {
    return <EmptyState title="No images yet" description={emptyDescription} />
  }

  const [hero, ...rest] = images
  const current = openIndex === null ? null : images[openIndex]

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[hero, ...rest].map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setOpenIndex(index)}
            className={`group relative overflow-hidden border border-border/70 bg-muted ${index === 0 && images.length > 1 ? "col-span-2 row-span-2" : ""}`}
            aria-label={`Open image ${index + 1} of ${images.length}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt={`${processName} - ${image.filename}`}
              loading="lazy"
              className={`size-full object-cover transition-transform duration-300 group-hover:scale-105 ${index === 0 && images.length > 1 ? "aspect-square md:aspect-auto md:h-full" : "aspect-square"}`}
            />
          </button>
        ))}
      </div>

      {current ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${processName} image viewer`}
          onClick={close}
        >
          <Button variant="secondary" size="icon" className="absolute top-4 right-4" onClick={close} aria-label="Close">
            <X className="size-5" />
          </Button>
          {images.length > 1 ? (
            <>
              <Button
                variant="secondary"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2"
                onClick={(event) => {
                  event.stopPropagation()
                  step(-1)
                }}
                aria-label="Previous image"
              >
                <ArrowLeft className="size-5" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2"
                onClick={(event) => {
                  event.stopPropagation()
                  step(1)
                }}
                aria-label="Next image"
              >
                <ArrowRight className="size-5" />
              </Button>
            </>
          ) : null}
          <figure className="max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.url} alt={`${processName} - ${current.filename}`} className="max-h-[80vh] w-auto max-w-full object-contain" />
            <figcaption className="mt-3 text-center text-sm text-white/80">
              {current.filename} · {(openIndex ?? 0) + 1} / {images.length}
            </figcaption>
          </figure>
        </div>
      ) : null}
    </>
  )
}
