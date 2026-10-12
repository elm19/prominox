import { redirect } from "next/navigation"

import { getMeOrNull } from "@/lib/api"
import { AuthShell } from "@/components/auth/auth-shell"
import { LoginForm } from "@/components/auth/login-form"

export const metadata = {
  title: "Sign in",
}

export default async function Page() {
  // Already signed in (e.g. reopened the tab): skip the form
  const user = await getMeOrNull()
  if (user) redirect(user.mustChangePassword ? "/auth/change-password" : "/")

  return (
    <AuthShell
      title="Sign in to your workspace"
      description="Access process monitoring, maintenance workflows, and factory data collection from one dashboard."
    >
      <div className="w-full">
        <LoginForm />
      </div>
    </AuthShell>
  )
}
