"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { createUser, deleteUser, resetUserPassword, type AuthUser, type IssuedCredentials } from "@/lib/api"
import { downloadCredentialsPdf, printCredentialsPdf } from "@/lib/credentials-pdf"
import { describeError } from "@/lib/errors"
import { Download, KeyRound, Plus, Printer, Trash2, X } from "@/lib/icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }) : "Never"
}

export function UsersManager({ users, currentUserId }: { users: AuthUser[]; currentUserId: number }) {
  const router = useRouter()
  const { toast } = useToast()
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  // The clear-text password only exists in this response: keep it on screen until the admin dismisses it
  const [issued, setIssued] = React.useState<{ credentials: IssuedCredentials; reset: boolean } | null>(null)

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true)
    try {
      await action()
      router.refresh()
    } catch (error) {
      toast({ title: failure, description: describeError(error), tone: "error" })
    } finally {
      setBusy(false)
    }
  }

  const create = (event: React.FormEvent) => {
    event.preventDefault()
    return run(async () => {
      const credentials = await createUser(name.trim())
      setIssued({ credentials, reset: false })
      setName("")
    }, "Could not create user")
  }

  const reset = (user: AuthUser) => {
    if (!window.confirm(`Reset the password of ${user.name} (${user.username})? Their current password and sessions stop working immediately.`)) return
    return run(async () => {
      setIssued({ credentials: await resetUserPassword(user.id), reset: true })
    }, "Could not reset password")
  }

  const remove = (user: AuthUser) => {
    if (!window.confirm(`Delete ${user.name} (${user.username})? This can't be undone.`)) return
    return run(async () => {
      await deleteUser(user.id)
      if (issued?.credentials.user.id === user.id) setIssued(null)
      toast({ title: "User deleted", description: user.username })
    }, "Could not delete user")
  }

  return (
    <div className="space-y-4">
      {issued ? <CredentialsSheet issued={issued.credentials} reset={issued.reset} onDismiss={() => setIssued(null)} /> : null}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <Card className="bg-card/80">
          <CardHeader>
            <CardTitle>All users</CardTitle>
            <CardDescription>{users.length} account{users.length === 1 ? "" : "s"}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-widest text-muted-foreground">
                  <tr className="border-b border-border/70">
                    <th className="py-2 pr-4 font-semibold">Name</th>
                    <th className="py-2 pr-4 font-semibold">Username</th>
                    <th className="py-2 pr-4 font-semibold">Status</th>
                    <th className="py-2 pr-4 font-semibold">Last sign-in</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-border/40 last:border-0">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{user.name}</p>
                        {user.email ? <p className="text-xs text-muted-foreground">{user.email}</p> : null}
                      </td>
                      <td className="py-3 pr-4 font-mono">{user.username}</td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {user.role === "admin" ? <Badge>Admin</Badge> : null}
                          {user.mustChangePassword ? <Badge variant="outline">Awaiting first sign-in</Badge> : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">{formatDate(user.lastLoginAt)}</td>
                      <td className="py-3">
                        {user.role === "admin" || user.id === currentUserId ? null : (
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="xs" disabled={busy} onClick={() => reset(user)}>
                              <KeyRound /> Reset password
                            </Button>
                            <Button variant="destructive" size="xs" disabled={busy} onClick={() => remove(user)} aria-label={`Delete ${user.username}`}>
                              <Trash2 /> Delete
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit bg-card/80">
          <CardHeader>
            <CardTitle>New user</CardTitle>
            <CardDescription>
              The username is generated from the name, along with a one-time password you print and hand over.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={create} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="new-user-name">Full name</Label>
                <Input
                  id="new-user-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Amina Benali"
                  minLength={2}
                  maxLength={120}
                  required
                />
              </div>
              <Button type="submit" disabled={busy || name.trim().length < 2}>
                <Plus /> Create user
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function CredentialsSheet({ issued, reset, onDismiss }: { issued: IssuedCredentials; reset: boolean; onDismiss: () => void }) {
  return (
    <Card className="border-primary/40 bg-card/90">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{reset ? "Password reset" : "User created"}: {issued.user.name}</CardTitle>
            <CardDescription>
              This password is shown only once and can&apos;t be recovered. Print or download the sheet now.
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onDismiss} aria-label="Dismiss">
            <X />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Username</dt>
            <dd className="mt-1 select-all font-mono text-xl">{issued.username}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Temporary password</dt>
            <dd className="mt-1 select-all font-mono text-xl">{issued.password}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => downloadCredentialsPdf(issued)}>
            <Download /> Download PDF
          </Button>
          <Button variant="outline" onClick={() => printCredentialsPdf(issued)}>
            <Printer /> Print
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
