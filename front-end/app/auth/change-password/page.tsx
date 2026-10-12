import { redirect } from "next/navigation"

import { AuthShell } from "@/components/auth/auth-shell"
import { ChangePasswordForm } from "@/components/account/change-password-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getMe } from "@/lib/api"

export const metadata = {
  title: "Choose a new password",
}

export default async function Page() {
  const user = await getMe() // sends the visitor to /auth/login when there is no session
  if (!user.mustChangePassword) redirect("/")

  return (
    <AuthShell
      title={`Welcome, ${user.name}`}
      description="You signed in with a temporary password. Choose your own to continue."
    >
      <Card className="border-border/70 bg-card/90 shadow-xl shadow-black/5">
        <CardHeader>
          <CardTitle className="text-2xl">Choose a new password</CardTitle>
          <CardDescription>The temporary password on your sheet stops working once you do.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm forced />
        </CardContent>
      </Card>
    </AuthShell>
  )
}
