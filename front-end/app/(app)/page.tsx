import { redirect } from "next/navigation"

// The processes list is the landing page: it shows every process and how recently it reported data
export default function HomePage() {
  redirect("/processes")
}
