import { notFound } from "next/navigation"

import { getMe } from "@/lib/api"

// The API enforces admin-only access; this just keeps the pages hidden from regular users
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getMe()
  if (user.role !== "admin") notFound()
  return children
}
