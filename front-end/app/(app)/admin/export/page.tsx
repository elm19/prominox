import { Download } from "@/lib/icons"

import { PageHeader } from "@/components/dashboard/page-header"
import { exportUrl, productExportUrl } from "@/lib/api"

export const metadata = {
  title: "Data export",
}

const downloads = [
  { label: "Sensor readings", helper: "Long format, all processes", href: exportUrl.readings() },
  { label: "Maintenance logs", helper: "Every intervention", href: exportUrl.maintenanceLogs() },
  { label: "Process catalogue", helper: "Processes and departments", href: exportUrl.processes() },
  { label: "Product catalogue", helper: "Products and specifications", href: productExportUrl.products() },
  { label: "Production runs", helper: "Past batches with yield and lead time", href: productExportUrl.runs() },
  { label: "Step executions", helper: "Per-process times and quantities", href: productExportUrl.runSteps() },
]

export default function ExportPage() {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Administration" title="Data export" description="Download the collected factory data as CSV to build training datasets." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {downloads.map((item) => (
          <a
            key={item.label}
            href={item.href}
            download
            className="flex items-center justify-between gap-3 border border-border/70 bg-card/80 p-4 transition-colors hover:bg-muted"
          >
            <div>
              <p className="font-medium">{item.label}</p>
              <p className="text-sm text-muted-foreground">{item.helper}</p>
            </div>
            <Download className="size-4 text-primary" />
          </a>
        ))}
      </div>
    </div>
  )
}
