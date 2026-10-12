import Link from "next/link"

import { AuthShell } from "@/components/auth/auth-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = {
  title: "Forgot your password",
}

export default function Page() {
  return (
    <AuthShell
      title="Forgot your password?"
      description="Passwords are reset by an administrator, there is no self-service reset."
    >
      <Card className="border-border/70 bg-card/90 shadow-xl shadow-black/5">
        <CardHeader>
          <CardTitle className="text-2xl">Ask your administrator</CardTitle>
          <CardDescription>
            Tell them your username. They will issue you a new temporary password on a printed sheet, and you will be
            asked to choose your own as soon as you sign in with it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <Link href="/auth/login">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
  )
}
