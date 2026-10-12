import { ApiError } from "@/lib/api"

/** Human-readable message for toasts, including per-value import problems. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.issues.length) {
      const lines = error.issues
        .slice(0, 4)
        .map((issue) => {
          const where = [
            issue.row !== undefined && issue.row !== null ? `Row ${issue.row + 1}` : null,
            issue.sensor_name ?? (issue.sensor_id ? `sensor ${issue.sensor_id}` : issue.field ?? null),
          ]
            .filter(Boolean)
            .join(", ")
          const got = issue.value !== undefined && issue.value !== null ? ` (got ${JSON.stringify(issue.value)})` : ""
          return `${where ? `${where}: ` : ""}${issue.message}${got}`
        })
      const more = error.issues.length > 4 ? ` +${error.issues.length - 4} more` : ""
      return `${error.message} ${lines.join(" | ")}${more}`
    }
    return error.message
  }
  return error instanceof Error ? error.message : "An unexpected error occurred."
}
