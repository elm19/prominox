"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { publishMaintenanceRisk, type MaintenanceRisk } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import { Explain, Note, RiskBadge, fmtDate, tooltipStyle } from "@/components/ai-lab/shared"

function Intervals({ risk }: { risk: MaintenanceRisk }) {
  const data = risk.intervals_days.map((days, i) => ({ n: `#${i + 1}`, days }))
  return (
    <div className="h-40 w-full max-w-xl">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="n" tickLine={false} axisLine={false} />
          <YAxis width={40} tickLine={false} axisLine={false} unit="d" />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} days`, "Between failures"]} cursor={{ fill: "var(--color-muted)", fillOpacity: 0.4 }} />
          <ReferenceLine y={risk.days_since_last ?? 0} stroke="#f43f5e" strokeDasharray="4 3" label={{ value: "now", position: "insideTopRight", fontSize: 11, fill: "#f43f5e" }} />
          <Bar dataKey="days" fill="#a78bfa" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function MaintenancePanel({ initial }: { initial: MaintenanceRisk[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = React.useState<number | null>(null)
  const [busy, setBusy] = React.useState<number | null>(null)
  const ready = initial.filter((r) => r.ready)
  const waiting = initial.filter((r) => !r.ready)

  const publish = async (risk: MaintenanceRisk) => {
    setBusy(risk.process_id)
    try {
      await publishMaintenanceRisk(risk.process_id)
      toast({ title: "Prediction published", description: `Now shown on the ${risk.process_name} page.` })
      router.refresh()
    } catch (e) {
      toast({ title: "Could not publish", description: describeError(e), tone: "error" })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Ranks active processes by how likely they are to need a corrective intervention in the next 14 days, based on their own maintenance history.</p>
      {ready.length === 0 ? <Note>No process has enough corrective maintenance logs yet. Log at least 3 corrective interventions on a process (type &quot;corrective&quot;) to get a prediction.</Note> : null}
      {ready.length ? (
        <div className="overflow-x-auto border border-border/70 bg-card/80">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border/70">
                <th className="px-3 py-3 font-medium">Process</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Risk in 14 days</th>
                <th className="px-3 py-3 font-medium">Usually fails every</th>
                <th className="px-3 py-3 font-medium">Since last</th>
                <th className="px-3 py-3 font-medium">Next expected</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {ready.map((r) => {
                const pct = Math.round((r.probability_14d ?? 0) * 100)
                const expanded = open === r.process_id
                return (
                  <React.Fragment key={r.process_id}>
                    <tr className="cursor-pointer border-b border-border/50 hover:bg-muted/30" onClick={() => setOpen(expanded ? null : r.process_id)}>
                      <td className="px-3 py-3">
                        <Link href={`/processes/${r.process_id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-primary">{r.process_name}</Link>
                        <p className="text-xs text-muted-foreground">{r.corrective_events} corrective logs</p>
                      </td>
                      <td className="px-3 py-3"><RiskBadge status={r.status!} /></td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 bg-muted">
                            <div className={cn("h-full", pct >= 50 ? "bg-rose-500" : pct >= 25 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.max(pct, 2)}%` }} />
                          </div>
                          <span className="tabular-nums">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 tabular-nums">{r.mean_interval_days!.toFixed(0)} days</td>
                      <td className={cn("px-3 py-3 tabular-nums", r.overdue && "font-medium text-amber-600 dark:text-amber-400")}>{r.days_since_last!.toFixed(0)} days{r.overdue ? " (over average)" : ""}</td>
                      <td className="px-3 py-3">{fmtDate(r.next_expected_at!)}</td>
                      <td className="px-3 py-3 text-right">
                        <Button size="xs" variant="outline" disabled={busy === r.process_id} onClick={(e) => { e.stopPropagation(); publish(r) }}>
                          {busy === r.process_id ? "…" : "Show on process page"}
                        </Button>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="border-b border-border/50 bg-muted/20">
                        <td colSpan={7} className="space-y-2 px-4 py-4">
                          <p className="text-sm text-muted-foreground">
                            Days between past corrective interventions (last one {fmtDate(r.last_corrective_at!)}). Data confidence {Math.round((r.confidence ?? 0) * 100)}%: it grows with every logged intervention.
                          </p>
                          <Intervals risk={r} />
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {waiting.length ? (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">{waiting.length} processes without enough history</summary>
          <ul className="mt-2 space-y-1">
            {waiting.map((r) => (
              <li key={r.process_id}>
                {r.process_name}: {r.note}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <Explain>
        <p>Only logs of type <em>corrective</em> count as failures. The time between consecutive ones is fitted with a Weibull distribution, the standard model for time-to-failure. Its spread decides whether wear-out is predictable (similar gaps) or random (very different gaps).</p>
        <p>Given how long the process has already run since its last failure, the model gives the chance of another one in the next 14 days, and the median time until it. Over 25% is &quot;watch&quot;, over 50% is &quot;service soon&quot;. Publishing saves the result so it appears on that process&apos;s Overview tab.</p>
      </Explain>
    </div>
  )
}
