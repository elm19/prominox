"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { changePassword } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"

const MIN_LENGTH = 10

/** `forced`: first sign-in or after a reset. The user must choose a password before reaching the app. */
export function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const router = useRouter()
  const { toast } = useToast()
  const [current, setCurrent] = React.useState("")
  const [next, setNext] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (next.length < MIN_LENGTH) return setError(`The new password must be at least ${MIN_LENGTH} characters.`)
    if (next !== confirm) return setError("The two new passwords don't match.")
    if (next === current) return setError("The new password must differ from the current one.")
    setBusy(true)
    try {
      await changePassword(current, next)
      toast({ title: "Password changed" })
      setCurrent("")
      setNext("")
      setConfirm("")
      if (forced) {
        router.replace("/")
      }
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
        <Label htmlFor="current-password">{forced ? "Temporary password" : "Current password"}</Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_LENGTH}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">At least {MIN_LENGTH} characters. A short sentence works well.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Saving..." : "Change password"}
      </Button>
    </form>
  )
}
