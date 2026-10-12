/** Minutes as "2 d 3 h", "5 h 32 min" or "40 min". */
export function fmtDuration(minutes: number) {
  const total = Math.round(minutes)
  if (total < 1) return "< 1 min"
  const d = Math.floor(total / 1440)
  const h = Math.floor((total % 1440) / 60)
  const m = total % 60
  if (d) return `${d} d${h ? ` ${h} h` : ""}`
  if (h) return `${h} h${m ? ` ${m} min` : ""}`
  return `${m} min`
}

/** Clock for the animation: "Day 1 · 03:25". */
export function fmtClock(minutes: number) {
  const total = Math.floor(minutes)
  const d = Math.floor(total / 1440)
  const h = Math.floor((total % 1440) / 60)
  const m = total % 60
  return `Day ${d + 1} · ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

export const ORDER_COLORS = ["#38bdf8", "#f59e0b", "#34d399", "#a78bfa", "#fb7185", "#14b8a6", "#f97316", "#facc15", "#60a5fa", "#e879f9"]
