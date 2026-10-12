"use client"

import * as React from "react"

import { CheckCircle2, CircleAlert, X } from "@/lib/icons"
import { cn } from "@/lib/utils"

type ToastTone = "success" | "error"

type ToastItem = {
  id: string
  title: string
  description?: string
  tone?: ToastTone
}

type ToastContextValue = {
  toast: (toast: Omit<ToastItem, "id">) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([])

  const dismiss = React.useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = React.useCallback(
    (next: Omit<ToastItem, "id">) => {
      const id = crypto.randomUUID()
      setItems((current) => [...current, { ...next, id }])
      window.setTimeout(() => dismiss(id), 4500)
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-3 border bg-card p-4 shadow-lg",
              item.tone === "error" ? "border-destructive/40" : "border-border"
            )}
          >
            {item.tone === "error" ? (
              <CircleAlert className="mt-0.5 size-4 text-destructive" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 text-emerald-500" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{item.title}</p>
              {item.description ? <p className="mt-1 text-sm text-muted-foreground">{item.description}</p> : null}
            </div>
            <button type="button" onClick={() => dismiss(item.id)} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) throw new Error("useToast must be used within ToastProvider")
  return context
}
