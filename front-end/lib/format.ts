export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes.toFixed(minutes < 10 ? 1 : 0)} min`
  const hours = minutes / 60
  return hours < 24 ? `${hours.toFixed(1)} h` : `${(hours / 24).toFixed(1)} d`
}

export function formatHours(hours: number) {
  return formatMinutes(hours * 60)
}

export function formatQuantity(value: number) {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
}
