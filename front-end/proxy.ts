import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Must match SESSION_COOKIE in the back-end (app/core/deps.py)
const SESSION_COOKIE = "prominox_session"

// Optimistic gate only: it checks that a session cookie exists so signed-out visitors never see app pages.
// The API validates the session on every request and is the real enforcement.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = request.cookies.has(SESSION_COOKIE)

  if (pathname.startsWith("/api/")) {
    return hasSession ? NextResponse.next() : NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const isAuthPage = pathname.startsWith("/auth/")
  if (!hasSession && !isAuthPage) {
    return NextResponse.redirect(new URL("/auth/login", request.url))
  }
  return NextResponse.next()
}

export const config = {
  // Everything except Next internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|gif)$).*)"],
}
