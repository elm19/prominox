import { DepartmentManager } from "@/components/departments/department-manager"
import { PageHeader } from "@/components/dashboard/page-header"
import { getDepartments } from "@/lib/api"

export const metadata = {
  title: "Departments",
}

export default async function DepartmentsPage() {
  const departments = await getDepartments()

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Factory structure"
        title="Departments"
        description="Departments are the zones of the factory. Each process belongs to exactly one department, and each department is a boundary box on the factory map."
      />
      <DepartmentManager departments={departments} />
    </div>
  )
}
