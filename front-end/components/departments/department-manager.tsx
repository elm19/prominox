"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { createDepartment, deleteDepartment, updateDepartment } from "@/lib/api"
import { describeError } from "@/lib/errors"
import { Plus, X } from "@/lib/icons"
import { EmptyState } from "@/components/dashboard/empty-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import type { Department } from "@/lib/types"

export function DepartmentManager({ departments }: { departments: Department[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [editingId, setEditingId] = React.useState<number | null>(null)
  const [editName, setEditName] = React.useState("")
  const [editDescription, setEditDescription] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true)
    try {
      await action()
      router.refresh()
    } catch (error) {
      toast({ title: failure, description: describeError(error), tone: "error" })
    } finally {
      setBusy(false)
    }
  }

  const create = (event: React.FormEvent) => {
    event.preventDefault()
    return run(async () => {
      await createDepartment({ name: name.trim(), description: description.trim() || null })
      toast({ title: "Department created", description: name.trim() })
      setName("")
      setDescription("")
    }, "Could not create department")
  }

  const startEdit = (department: Department) => {
    setEditingId(department.id)
    setEditName(department.name)
    setEditDescription(department.description ?? "")
  }

  const saveEdit = (event: React.FormEvent) => {
    event.preventDefault()
    return run(async () => {
      await updateDepartment(editingId as number, { name: editName.trim(), description: editDescription.trim() || null })
      toast({ title: "Department updated", description: editName.trim() })
      setEditingId(null)
    }, "Could not update department")
  }

  const remove = (department: Department) => {
    if (!window.confirm(`Delete the department "${department.name}"?`)) return
    return run(async () => {
      await deleteDepartment(department.id)
      toast({ title: "Department deleted", description: department.name })
    }, "Could not delete department")
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
      <Card className="bg-card/80">
        <CardHeader>
          <CardTitle>All departments</CardTitle>
        </CardHeader>
        <CardContent>
          {departments.length === 0 ? (
            <EmptyState title="No departments" description="Create the first department to start adding processes." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border/70">
                    <th className="px-3 py-3 font-medium">Name</th>
                    <th className="px-3 py-3 font-medium">Description</th>
                    <th className="px-3 py-3 font-medium">Processes</th>
                    <th className="px-3 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((department) =>
                    editingId === department.id ? (
                      <tr key={department.id} className="border-b border-border/50">
                        <td colSpan={4} className="px-3 py-3">
                          <form onSubmit={saveEdit} className="grid gap-3 md:grid-cols-[1fr_1.5fr_auto]">
                            <Input value={editName} onChange={(event) => setEditName(event.target.value)} aria-label="Department name" required maxLength={100} />
                            <Input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} aria-label="Department description" placeholder="Description" />
                            <div className="flex gap-2">
                              <Button type="submit" size="sm" disabled={busy || !editName.trim()}>
                                Save
                              </Button>
                              <Button type="button" size="icon-sm" variant="outline" onClick={() => setEditingId(null)} aria-label="Cancel edit">
                                <X className="size-4" />
                              </Button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    ) : (
                      <tr key={department.id} className="border-b border-border/50 last:border-b-0">
                        <td className="px-3 py-3 font-medium">{department.name}</td>
                        <td className="px-3 py-3 text-muted-foreground">{department.description || "-"}</td>
                        <td className="px-3 py-3">
                          <Link href="/processes" className="text-primary">
                            {department.processCount}
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-2">
                            <Button size="xs" variant="outline" onClick={() => startEdit(department)} disabled={busy}>
                              Rename
                            </Button>
                            <Button
                              size="xs"
                              variant="destructive"
                              onClick={() => remove(department)}
                              disabled={busy || department.processCount > 0}
                              title={department.processCount > 0 ? "Move or delete its processes first" : undefined}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/80 self-start">
        <CardHeader>
          <CardTitle>New department</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="department-name">Name</Label>
              <Input id="department-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. peinture" required maxLength={100} />
              <p className="text-xs text-muted-foreground">Names are unique, ignoring upper/lower case.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="department-description">Description (optional)</Label>
              <Input id="department-description" value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            <Button type="submit" disabled={busy || !name.trim()}>
              <Plus className="size-4" />
              Create department
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
