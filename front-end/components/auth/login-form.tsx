'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { login } from '@/lib/api'
import { describeError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LoginForm({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const user = await login(username.trim(), password)
      // First sign-in with a generated password: choose a personal one before anything else
      router.replace(user.mustChangePassword ? '/auth/change-password' : '/')
      router.refresh()
    } catch (error) {
      setError(describeError(error))
      setIsLoading(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card className="border-border/70 bg-card/90 shadow-xl shadow-black/5">
        <CardHeader>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>Use the username and password you were given by your administrator.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="firstname.lastname"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                  >
                    Forgot your password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Signing in...' : 'Sign in'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
