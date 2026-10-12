"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { updateEmail } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"

export function EmailForm({ email }: { email: string | null }) {
  const router = useRouter()
  const { toast } = useToast()
  const [value, setValue] = React.useState(email ?? "")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await updateEmail(password, value.trim() || null)
      toast({ title: value.trim() ? "Email updated" : "Email removed" })
      setPassword("")
      router.refresh()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Leave empty to remove your email.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email-password">Current password</Label>
        <Input
          id="email-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Needed to confirm it is really you.</p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy || value.trim() === (email ?? "")}>
        {busy ? "Saving..." : "Save email"}
      </Button>
    </form>
  )
}
