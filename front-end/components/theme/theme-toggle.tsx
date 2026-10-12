"use client"

import { Moon, SunMedium } from "@/lib/icons"

import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  // Icons switch with CSS (`dark:`) so server and client render the same markup.
  const toggleTheme = () => {
    const nextIsDark = !document.documentElement.classList.contains("dark")
    document.documentElement.classList.toggle("dark", nextIsDark)
    window.localStorage.setItem("theme", nextIsDark ? "dark" : "light")
  }

  return (
    <Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label="Toggle theme" className="rounded-xl">
      <SunMedium className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </Button>
  )
}
