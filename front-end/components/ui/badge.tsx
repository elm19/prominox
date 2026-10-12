import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-border bg-muted text-foreground",
        success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        warning: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        danger: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
        info: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
        outline: "border-border bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />
}

export { Badge, badgeVariants }
