import { UsersManager } from "@/components/admin/users-manager"
import { PageHeader } from "@/components/dashboard/page-header"
import { getMe, getUsers } from "@/lib/api"

export const metadata = {
  title: "Users",
}

export default async function UsersPage() {
  const [users, me] = await Promise.all([getUsers(), getMe()])

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Create accounts and hand each person a printed sheet with their credentials. Forgotten passwords are reset here."
      />
      <UsersManager users={users} currentUserId={me.id} />
    </div>
  )
}
