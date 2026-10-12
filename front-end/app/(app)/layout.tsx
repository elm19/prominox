import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getMe } from "@/lib/api"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"

// Pages read live factory data from the API on every request
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Dashboard",
}

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const user = await getMe() // redirects to /auth/login without a valid session
  if (user.mustChangePassword) redirect("/auth/change-password")
  return <DashboardLayout user={{ name: user.name, username: user.username, role: user.role }}>{children}</DashboardLayout>
}
