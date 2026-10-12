import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ProcessDetailView } from "@/components/processes/process-detail-view"
import { getProcess, getProductFlows } from "@/lib/api"

export async function generateMetadata(props: PageProps<"/processes/[processId]">): Promise<Metadata> {
  const { processId } = await props.params
  const process = Number.isInteger(Number(processId)) ? await getProcess(Number(processId)) : null

  return {
    title: process?.name ?? "Process not found",
  }
}

export default async function ProcessDetailPage(props: PageProps<"/processes/[processId]">) {
  const { processId } = await props.params
  const process = Number.isInteger(Number(processId)) ? await getProcess(Number(processId)) : null

  if (!process) {
    notFound()
  }

  const flows = (await getProductFlows()).filter((flow) => flow.processIds.includes(process.id))

  return <ProcessDetailView process={process} flows={flows} />
}
