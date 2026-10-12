import Link from "next/link"
import { SearchX } from "@/lib/icons"

import { EmptyState } from "@/components/dashboard/empty-state"
import { Button } from "@/components/ui/button"

export default function ProtectedNotFound() {
  return (
    <div className="py-10">
      <EmptyState
        title="We couldn't find that resource"
        description="The record you asked for does not exist in the current workspace. Head back to the processes list and keep exploring from there."
        icon={<SearchX className="size-5 text-primary" />}
        action={
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/processes">Browse processes</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/map">Open factory map</Link>
            </Button>
          </div>
        }
      />
    </div>
  )
}
