import { ProcessForm } from "@/components/forms/process-form"
import { PageHeader } from "@/components/dashboard/page-header"
import { EmptyState } from "@/components/dashboard/empty-state"
import { Button } from "@/components/ui/button"
import { getDepartments } from "@/lib/api"
import Link from "next/link"

export const metadata = {
  title: "Add a process",
}

export default async function AddProcessPage() {
  const departments = await getDepartments()

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Process onboarding"
        title="Add a process"
        description="Register a process performed by a person or a machine, assign it to a department, and document it with images."
      />
      {departments.length === 0 ? (
        <EmptyState
          title="Create a department first"
          description="Every process belongs to a department."
          action={
            <Button asChild>
              <Link href="/departments">Manage departments</Link>
            </Button>
          }
        />
      ) : (
        <ProcessForm departments={departments} />
      )}
    </div>
  )
}
