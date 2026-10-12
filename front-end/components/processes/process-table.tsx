"use client"

import * as React from "react"
import Link from "next/link"
import { Search } from "@/lib/icons"

import { getProcessKpis, getRelativeUpdate } from "@/lib/kpi-utils"
import type { Process, ProcessStatus } from "@/lib/types"
import { ProcessStatusBadge, ProcessTypeBadge, RrtBadge } from "@/components/processes/process-status-badge"
import { Input } from "@/components/ui/input"
import { formatCapacity } from "@/lib/utils"

const filters: Array<ProcessStatus | "all"> = ["all", "active", "inactive"]

export function ProcessTable({ processes }: { processes: Process[] }) {
  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState<ProcessStatus | "all">("all")

  const filtered = processes.filter((process) => {
    const matchesQuery =
      process.name.toLowerCase().includes(query.toLowerCase()) ||
      process.code.toLowerCase().includes(query.toLowerCase()) ||
      process.type.includes(query.toLowerCase()) ||
      (process.department?.name ?? "").toLowerCase().includes(query.toLowerCase())
    const matchesStatus = status === "all" ? true : process.status === status
    return matchesQuery && matchesStatus
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name, code, type, or department" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatus(filter)}
              className={`rounded-lg border px-3 py-2 text-sm capitalize ${status === filter ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border/70">
              <th className="px-3 py-3 font-medium">Process</th>
              <th className="px-3 py-3 font-medium">Type</th>
              <th className="px-3 py-3 font-medium">Department</th>
              <th className="px-3 py-3 font-medium">Capacity</th>
              <th className="px-3 py-3 font-medium">Qty</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Sensors</th>
              <th className="px-3 py-3 font-medium">Last update</th>
              <th className="px-3 py-3 font-medium">Availability</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((process) => {
              const kpis = getProcessKpis(process)
              return (
                <tr key={process.id} className={`border-b border-border/50 last:border-b-0 hover:bg-muted/30 ${process.status === "inactive" ? "opacity-60" : ""}`}>
                  <td className="px-3 py-3">
                    <Link href={`/processes/${process.id}`} className="font-medium text-primary">
                      {process.name}
                    </Link>
                    <p className="mt-1 text-muted-foreground">{process.code}</p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      <ProcessTypeBadge type={process.type} />
                      {process.rrtEnabled ? <RrtBadge /> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3">{process.department?.name ?? "-"}</td>
                  <td className="px-3 py-3">{formatCapacity(process.capacity)}</td>
                  <td className="px-3 py-3">x{process.quantity}</td>
                  <td className="px-3 py-3">
                    <ProcessStatusBadge status={process.status} />
                  </td>
                  <td className="px-3 py-3">{process.sensors.length}</td>
                  <td className="px-3 py-3">{getRelativeUpdate(process.lastUpdate)}</td>
                  <td className="px-3 py-3">{kpis[0].value}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
