import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Capacity 0 means "dynamic" (no fixed limit). */
export function formatCapacity(capacity: number) {
  return capacity === 0 ? "Dynamic" : String(capacity)
}
