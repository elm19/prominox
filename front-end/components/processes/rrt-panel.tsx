"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { getRrtConfig, rotateRrtToken, setRrtEnabled, type RrtConfig } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { Broadcast, Check, Copy, Refresh } from "@/lib/icons"
import { formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import type { Process } from "@/lib/types"

function exampleValue(dataType: string) {
  return dataType === "number" ? 21.5 : dataType === "boolean" ? true : "value"
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = React.useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt("Copy this text:", text)
    }
  }
  return (
    <Button type="button" size="xs" variant="outline" onClick={copy} aria-label={label}>
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  )
}

export function RrtPanel({ process }: { process: Process }) {
  const router = useRouter()
  const { toast } = useToast()
  const [config, setConfig] = React.useState<RrtConfig | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const isMachine = process.type === "machine"

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const next = await getRrtConfig(process.id)
        if (cancelled) return
        setConfig(next)
        setLoadError(null)
      } catch (error) {
        if (!cancelled) setLoadError(describeError(error))
      }
    }
    load()
    const interval = window.setInterval(() => document.visibilityState === "visible" && load(), 5000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [process.id])

  const run = async (action: () => Promise<RrtConfig>, success: string, failure: string) => {
    setBusy(true)
    try {
      setConfig(await action())
      toast({ title: success })
      router.refresh()
    } catch (error) {
      toast({ title: failure, description: describeError(error), tone: "error" })
    } finally {
      setBusy(false)
    }
  }

  const rotate = () => {
    if (!window.confirm("Create a new link? The current link stops working immediately and Node-RED must be updated.")) return
    return run(() => rotateRrtToken(process.id), "New link created", "Could not create a new link")
  }

  const payload = {
    timestamp: "2026-05-06T08:00:00Z (optional, defaults to the time of the request)",
    values: Object.fromEntries(process.sensors.map((sensor) => [sensor.name, exampleValue(sensor.dataType)])),
  }
  const flatPayload = Object.fromEntries(process.sensors.map((sensor) => [sensor.name, exampleValue(sensor.dataType)]))
  const functionNode = `// Node-RED "function" node: build one reading from your sensors
msg.payload = ${JSON.stringify(flatPayload, null, 2)};
return msg;`
  const curl = config?.ingestUrl ? `curl -X POST '${config.ingestUrl}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(flatPayload)}'` : ""
  const enabled = config?.enabled ?? process.rrtEnabled

  return (
    <Card className="bg-card/80">
      <CardHeader className="gap-3 md:flex md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Broadcast className="size-5 text-primary" />
            Live data (RRT)
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time reception: Node-RED posts this machine&apos;s sensor values to a private link, they are stored, and the charts follow them live.
          </p>
        </div>
        <Button onClick={() => run(() => setRrtEnabled(process.id, !enabled), enabled ? "RRT disabled" : "RRT enabled", "Could not change RRT")} disabled={busy || !isMachine || !config} variant={enabled ? "outline" : "default"}>
          {enabled ? "Disable RRT" : "Enable RRT"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {!isMachine ? <p className="text-sm text-muted-foreground">RRT is only available for machines. This process is manual.</p> : null}
        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        {isMachine && process.sensors.length === 0 ? (
          <p className="border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
            Define this machine&apos;s sensors first (Sensors section above). Node-RED values are matched to sensors by name.
          </p>
        ) : null}

        {enabled && config?.ingestUrl ? (
          <>
            <div className="space-y-2">
              <p className="text-sm font-medium">POST link for Node-RED</p>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <code className="min-w-0 flex-1 overflow-x-auto border border-border bg-background px-3 py-2 text-xs whitespace-nowrap">{config.ingestUrl}</code>
                <div className="flex gap-2">
                  <CopyButton text={config.ingestUrl} label="Copy link" />
                  <Button type="button" size="xs" variant="outline" onClick={rotate} disabled={busy}>
                    <Refresh className="size-3.5" />
                    New link
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Anyone with this link can send data for this machine, so keep it private. The host is the API address this app uses: replace it if Node-RED reaches the server by another address.
              </p>
            </div>

            <div className="grid gap-3 text-sm md:grid-cols-3">
              <div className="border border-border/70 bg-background/70 p-3">
                <p className="text-muted-foreground">Enabled since</p>
                <p className="mt-1 font-medium">{config.enabledAt ? formatDateTime(config.enabledAt) : "-"}</p>
              </div>
              <div className="border border-border/70 bg-background/70 p-3">
                <p className="text-muted-foreground">Last data received</p>
                <p className="mt-1 font-medium">{config.lastReceivedAt ? formatDateTime(config.lastReceivedAt) : "Nothing yet"}</p>
              </div>
              <div className={`border p-3 ${config.lastError ? "border-amber-500/40 bg-amber-500/10" : "border-border/70 bg-background/70"}`}>
                <p className="text-muted-foreground">Last rejected request</p>
                <p className="mt-1 font-medium">{config.lastError ? `${config.lastError}${config.lastErrorAt ? ` (${formatDateTime(config.lastErrorAt)})` : ""}` : "None"}</p>
              </div>
            </div>

            <details className="border border-border/70 bg-background/70 p-4">
              <summary className="cursor-pointer text-sm font-medium">How to set up Node-RED</summary>
              <div className="mt-4 space-y-4 text-sm">
                <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                  <li>
                    Add an <strong className="text-foreground">inject</strong> node set to repeat at your sampling interval (or any node that outputs your sensor values).
                  </li>
                  <li>
                    Add a <strong className="text-foreground">function</strong> node that sets <code>msg.payload</code> to an object of sensor values (below). Keys are this machine&apos;s sensor names.
                  </li>
                  <li>
                    Add an <strong className="text-foreground">http request</strong> node: method <code>POST</code>, URL = the link above, return <em>a parsed JSON object</em>. Wire it after the function node.
                  </li>
                  <li>
                    Values must match each sensor&apos;s type (number, boolean or text). A request with any invalid value is rejected as a whole, and the reason is shown above and in the node&apos;s output.
                  </li>
                </ol>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="font-medium">Function node</p>
                    <CopyButton text={functionNode} label="Copy function node code" />
                  </div>
                  <pre className="overflow-x-auto border border-border bg-background p-3 text-xs">{functionNode}</pre>
                </div>
                <div>
                  <p className="mb-1 font-medium">Accepted bodies</p>
                  <pre className="overflow-x-auto border border-border bg-background p-3 text-xs">{`// one reading, flat (timestamp optional)
${JSON.stringify(flatPayload)}

// with an explicit timestamp (ISO date, or unix time in s / ms)
${JSON.stringify(payload, null, 2)}

// several readings at once
{ "readings": [ { "timestamp": "...", "values": { ... } }, ... ] }`}</pre>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="font-medium">Test from a terminal</p>
                    <CopyButton text={curl} label="Copy curl command" />
                  </div>
                  <pre className="overflow-x-auto border border-border bg-background p-3 text-xs">{curl}</pre>
                </div>
              </div>
            </details>
          </>
        ) : null}

        {!enabled && isMachine && config?.ingestPath ? (
          <p className="text-sm text-muted-foreground">RRT is disabled. The link is kept but rejects requests until you enable RRT again.</p>
        ) : null}
        {!enabled && isMachine && !config?.ingestPath && config ? (
          <p className="text-sm text-muted-foreground">Enable RRT to create this machine&apos;s private POST link.</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
