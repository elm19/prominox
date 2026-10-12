"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { Building, BrainCircuit, Download, Package, ClipboardList, Factory, Menu, PanelLeft, Play, PlusSquare, UserRound, Users, Wrench, LogOut } from "@/lib/icons"

import { logout } from "@/lib/api"
import { ChatbotWidget } from "@/components/chatbot/chatbot-widget"

import { ThemeToggle } from "@/components/theme/theme-toggle"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type NavItem = { href: string; label: string; icon: typeof Wrench; adminOnly?: boolean }

const navigation: NavItem[] = [
  { href: "/map", label: "Factory map", icon: Factory },
  { href: "/departments", label: "Departments", icon: Building },
  { href: "/processes", label: "Processes", icon: Wrench },
  { href: "/products", label: "Products", icon: Package },
  { href: "/simulation", label: "Simulation", icon: Play },
  { href: "/maintenance", label: "Maintenance", icon: ClipboardList },
  { href: "/processes/add", label: "Add process", icon: PlusSquare },
  { href: "/ai-lab", label: "AI Lab", icon: BrainCircuit },
  { href: "/account", label: "My account", icon: UserRound },
  { href: "/admin/users", label: "Users", icon: Users, adminOnly: true },
  { href: "/admin/export", label: "Data export", icon: Download, adminOnly: true },
]

// Longest matching nav entry wins, so /processes/add does not also highlight /processes
function isActive(pathname: string, href: string) {
  const matches = (target: string) => pathname === target || (target !== "/" && pathname.startsWith(`${target}/`))
  if (!matches(href)) return false
  return !navigation.some((other) => other.href.length > href.length && matches(other.href))
}

export type SessionUser = { name: string; username: string; role: "admin" | "user" }

export function DashboardLayout({ children, user }: { children: React.ReactNode; user: SessionUser }) {
  const pathname = usePathname()
  const router = useRouter()
  const items = navigation.filter((item) => !item.adminOnly || user.role === "admin")

  const signOut = async () => {
    try {
      await logout()
    } finally {
      router.replace("/auth/login")
      router.refresh()
    }
  }
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [collapsed, setCollapsed] = React.useState(false)
  React.useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
      setCollapsed(window.localStorage.getItem("sidebar") === "collapsed")
    } catch {}
  }, [])
  const toggleCollapsed = () => {
    setCollapsed((current) => {
      try {
        window.localStorage.setItem("sidebar", current ? "expanded" : "collapsed")
      } catch {}
      return !current
    })
  }

  return (
    <div className="h-svh overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.08),transparent_30%)]">
      <div className={cn("grid h-full transition-[grid-template-columns] duration-200", collapsed ? "md:grid-cols-[68px_minmax(0,1fr)]" : "md:grid-cols-[256px_minmax(0,1fr)]")}>
        <aside className="hidden h-svh border-r border-border/70 bg-card/80 backdrop-blur md:flex md:flex-col">
          <div className={cn("flex min-h-0 flex-1 flex-col py-4", collapsed ? "px-2" : "px-4")}>
            <div className={cn("flex items-center", collapsed ? "flex-col gap-3" : "justify-between gap-2")}>
              <div className="flex min-w-0 items-center gap-3">
                <div className="size-10 shrink-0 overflow-hidden rounded-xl border border-primary/20 bg-primary/10 shadow-sm">
                  <Image src="/site-logo.png" alt="Prominox" width={40} height={40} className="size-full object-cover" priority />
                </div>
                {collapsed ? null : (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Prominox</p>
                    <p className="truncate text-sm font-semibold">Digital factory</p>
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon-sm" onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
                <PanelLeft className="size-4" />
              </Button>
            </div>
            <nav className="mt-5 flex-1 space-y-1 overflow-y-auto overflow-x-hidden">
              {items.map((item) => {
                const Icon = item.icon
                const active = isActive(pathname, item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    aria-label={item.label}
                    className={cn(
                      "flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-colors",
                      collapsed ? "justify-center px-0" : "px-3",
                      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {collapsed ? null : <span className="truncate">{item.label}</span>}
                  </Link>
                )
              })}
            </nav>
            <div className={cn("mt-4 flex items-center gap-2 rounded-2xl border border-border/70 bg-background/80 p-2", collapsed && "flex-col")}>
              <ThemeToggle />
              {collapsed ? null : (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.role === "admin" ? "Administrator" : user.username}</p>
                </div>
              )}
              <Button variant="ghost" size="icon-sm" onClick={signOut} aria-label="Sign out" title="Sign out">
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 flex-col overflow-hidden">
          <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur md:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-3">
                <div className="size-10 overflow-hidden rounded-xl border border-primary/20 bg-primary/10 shadow-sm">
                  <Image src="/site-logo.png" alt="" width={40} height={40} className="size-full object-cover" priority />
                </div>
                <div>
                  <p className="text-sm font-semibold">Prominox</p>
                  <p className="text-xs text-muted-foreground">Digital factory</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <Button variant="outline" size="icon-sm" onClick={signOut} aria-label="Sign out">
                  <LogOut className="size-4" />
                </Button>
                <Button variant="outline" size="icon-sm" onClick={() => setMobileOpen((current) => !current)} aria-label="Toggle navigation">
                  <Menu className="size-4" />
                </Button>
              </div>
            </div>
            {mobileOpen ? (
              <div className="mt-4 space-y-2">
                {items.map((item) => {
                  const Icon = item.icon
                  const active = isActive(pathname, item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                        active ? "bg-primary text-primary-foreground" : "bg-card text-foreground"
                      )}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            ) : null}
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
      <ChatbotWidget />
    </div>
  )
}
