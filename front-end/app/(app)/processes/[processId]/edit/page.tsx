import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "@/lib/icons"

import { ProcessForm } from "@/components/forms/process-form"
import { PageHeader } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { getDepartments, getProcess } from "@/lib/api"

export const metadata: Metadata = {
  title: "Edit process",
}

export default async function EditProcessPage(props: PageProps<"/processes/[processId]/edit">) {
  const { processId } = await props.params
  const [process, departments] = await Promise.all([
    Number.isInteger(Number(processId)) ? getProcess(Number(processId)) : null,
    getDepartments(),
  ])

  if (!process) {
    notFound()
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Process"
        title={`Edit ${process.name}`}
        description="Change the process details, move it to another department, or manage its images."
        actions={
          <Button asChild variant="outline">
            <Link href={`/processes/${process.id}`}>
              <ArrowLeft className="size-4" />
              Back to process
            </Link>
          </Button>
        }
      />
      <ProcessForm departments={departments} process={process} />
    </div>
  )
}
