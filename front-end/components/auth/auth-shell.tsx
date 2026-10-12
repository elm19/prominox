import type { ReactNode } from "react"
import Image from "next/image"
import { Activity, Factory, ShieldCheck } from "@/lib/icons"

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="relative flex min-h-svh overflow-hidden bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.14),transparent_42%)]" />
      <div className="relative grid min-h-svh w-full lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden border-r border-border/60 bg-card/60 px-10 py-12 backdrop-blur lg:flex lg:flex-col lg:justify-between">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-3">
              <div className="size-11 overflow-hidden rounded-xl border border-primary/20 bg-primary/10 shadow-sm">
                <Image src="/site-logo.png" alt="" width={44} height={44} className="size-full object-cover" priority />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Prominox
                </p>
                <h1 className="text-3xl font-semibold">Digital factory platform</h1>
              </div>
            </div>
            <div className="max-w-xl space-y-3">
              <p className="text-4xl font-semibold leading-tight">
                Digitalise Prominox: processes, products, and production data in one place.
              </p>
              <p className="text-base leading-7 text-muted-foreground">
                Visualise every process, follow maintenance, and collect the data that will train tomorrow&apos;s AI.
              </p>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="rounded-xl border border-border/70 bg-background/80 p-4">
              <Activity className="mb-3 size-5 text-sky-500" />
              <p className="font-medium">Live telemetry view</p>
              <p className="mt-1 text-sm text-muted-foreground">Sensor-aware charts and process timelines.</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/80 p-4">
              <ShieldCheck className="mb-3 size-5 text-emerald-500" />
              <p className="font-medium">Maintenance governance</p>
              <p className="mt-1 text-sm text-muted-foreground">Structured logs, downtime context, and status flow.</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/80 p-4">
              <Factory className="mb-3 size-5 text-amber-500" />
              <p className="font-medium">Data for AI</p>
              <p className="mt-1 text-sm text-muted-foreground">CSV exports of readings and logs for model training.</p>
            </div>
          </div>
        </section>
        <section className="relative flex items-center justify-center px-6 py-10 md:px-10">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-2 text-center lg:hidden">
              <div className="mx-auto mb-3 size-12 overflow-hidden rounded-xl border border-primary/20 bg-primary/10 shadow-sm">
                <Image src="/site-logo.png" alt="" width={48} height={48} className="size-full object-cover" priority />
              </div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Prominox</p>
              <h1 className="text-3xl font-semibold">Digital factory platform</h1>
            </div>
            <div className="space-y-2 text-center lg:text-left">
              <h2 className="text-2xl font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            {children}
          </div>
        </section>
      </div>
    </div>
  )
}
