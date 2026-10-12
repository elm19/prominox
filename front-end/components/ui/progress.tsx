import { cn } from "@/lib/utils"

type ProgressProps = {
  value: number
  className?: string
}

export function Progress({ value, className }: ProgressProps) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}
