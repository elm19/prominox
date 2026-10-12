import { ChangePasswordForm } from "@/components/account/change-password-form"
import { EmailForm } from "@/components/account/email-form"
import { PageHeader } from "@/components/dashboard/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getMe } from "@/lib/api"

export const metadata = {
  title: "My account",
}

export default async function AccountPage() {
  const user = await getMe()

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Account"
        title="My account"
        description="Change your password and your contact email. Your name and username are managed by an administrator."
        actions={<Badge variant="outline">{user.role === "admin" ? "Administrator" : "User"}</Badge>}
      />
      <Card className="bg-card/80">
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Name</p>
            <p className="mt-1 text-lg">{user.name}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Username</p>
            <p className="mt-1 font-mono text-lg">{user.username}</p>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="bg-card/80">
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>You stay signed in here; every other session is signed out.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
        <Card className="bg-card/80">
          <CardHeader>
            <CardTitle>Email</CardTitle>
            <CardDescription>Optional. Stored on your account only.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmailForm key={user.email ?? ""} email={user.email} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
